from fastapi import FastAPI, APIRouter, HTTPException
from fastapi.responses import JSONResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import httpx
import time
import secrets
import bcrypt
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict
from typing import Optional
from datetime import datetime, timezone

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

app = FastAPI()
api_router = APIRouter(prefix="/api")

# ── In-memory TTL cache (8s) for price + balance ─────────────────────────────
_CACHE: dict[str, tuple[float, object]] = {}
_CACHE_TTL = 8.0  # seconds

def cache_get(key: str):
    hit = _CACHE.get(key)
    if hit and (time.time() - hit[0]) < _CACHE_TTL:
        return hit[1]
    return None

def cache_set(key: str, value):
    _CACHE[key] = (time.time(), value)

# ── Recovery session tokens (in-memory) ──────────────────────────────────────
_RECOVERY_TOKENS: dict[str, float] = {}  # token -> expiry epoch
_RECOVERY_TTL = 60 * 60 * 2  # 2 hours

def issue_recovery_token() -> str:
    t = secrets.token_urlsafe(32)
    _RECOVERY_TOKENS[t] = time.time() + _RECOVERY_TTL
    return t

def verify_recovery_token(token: Optional[str]) -> bool:
    if not token:
        return False
    exp = _RECOVERY_TOKENS.get(token)
    if not exp:
        return False
    if time.time() > exp:
        _RECOVERY_TOKENS.pop(token, None)
        return False
    return True

# ── Models ───────────────────────────────────────────────────────────────────

class TokenMintConfig(BaseModel):
    configured: bool = False
    mint: Optional[str] = None
    decimals: Optional[int] = 6
    supply: Optional[str] = "1000000000"
    treasury: Optional[str] = None
    mainWallet: Optional[str] = None
    network: Optional[str] = "mainnet-beta"
    launchpad: Optional[str] = None
    tx: Optional[str] = None
    launchedAt: Optional[str] = None

class TokenMintUpdate(BaseModel):
    mint: str
    decimals: Optional[int] = 6
    supply: Optional[str] = "1000000000"
    treasury: Optional[str] = None
    mainWallet: Optional[str] = None
    network: Optional[str] = "mainnet-beta"
    launchpad: Optional[str] = None
    tx: Optional[str] = None

# ── Token Mint CRUD ──────────────────────────────────────────────────────────

@api_router.get("/token-mint")
async def get_token_mint():
    try:
        record = await db.token_mint_config.find_one({}, {"_id": 0})
        if not record:
            return {"configured": False}
        return record
    except Exception as e:
        logger.error(f"Error fetching token mint: {e}")
        return {"configured": False}

@api_router.post("/token-mint")
async def save_token_mint(body: TokenMintUpdate):
    try:
        import re
        if not re.match(r'^[1-9A-HJ-NP-Za-km-z]{32,44}$', body.mint):
            raise HTTPException(status_code=400, detail="Invalid mint address format")
        
        doc = {
            "configured": True,
            "mint": body.mint,
            "decimals": body.decimals,
            "supply": body.supply,
            "treasury": body.treasury or "7dzgCA8G55VytZ8PS1b99rbbctzCgJbnEoBEYBnn15YR",
            "mainWallet": body.mainWallet or "7dzgCA8G55VytZ8PS1b99rbbctzCgJbnEoBEYBnn15YR",
            "network": body.network or "mainnet-beta",
            "launchpad": body.launchpad,
            "tx": body.tx,
            "launchedAt": datetime.now(timezone.utc).isoformat(),
        }
        await db.token_mint_config.replace_one({}, doc, upsert=True)
        return doc
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error saving token mint: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.delete("/token-mint")
async def delete_token_mint():
    try:
        await db.token_mint_config.delete_many({})
        return {"ok": True}
    except Exception as e:
        logger.error(f"Error deleting token mint: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# ── Jupiter Price Proxy ──────────────────────────────────────────────────────

@api_router.get("/jupiter-price")
async def get_jupiter_price(mint: str):
    try:
        if not mint or len(mint) < 32:
            return {"ok": False, "price": None, "error": "Invalid mint address"}

        cached = cache_get(f"price:{mint}")
        if cached is not None:
            return cached

        async with httpx.AsyncClient(timeout=8.0) as client_h:
            resp = await client_h.get(
                f"https://lite-api.jup.ag/price/v3",
                params={"ids": mint},
                headers={"Accept": "application/json"}
            )
            if resp.status_code == 200:
                data = resp.json()
                price_data = data.get(mint, {})
                price = price_data.get("usdPrice")
                if price is not None:
                    out = {"ok": True, "price": float(price), "mint": mint}
                else:
                    out = {"ok": True, "price": None, "mint": mint}
                cache_set(f"price:{mint}", out)
                return out
            return {"ok": False, "price": None, "error": f"Jupiter returned {resp.status_code}"}
    except httpx.TimeoutException:
        return {"ok": False, "price": None, "error": "Jupiter API timeout"}
    except Exception as e:
        logger.error(f"Jupiter price error: {e}")
        return {"ok": False, "price": None, "error": str(e)}

# ── Solana Balance Proxy ─────────────────────────────────────────────────────

SOLANA_RPC = os.environ.get("SOLANA_RPC_URL", "https://api.mainnet-beta.solana.com")

@api_router.get("/solana-balance")
async def get_solana_balance(owner: str):
    try:
        if not owner or len(owner) < 32:
            return {"ok": False, "error": "Invalid owner address"}

        cached = cache_get(f"bal:{owner}")
        if cached is not None:
            return cached

        async with httpx.AsyncClient(timeout=10.0) as client_h:
            # Get SOL balance
            sol_resp = await client_h.post(
                SOLANA_RPC,
                json={
                    "jsonrpc": "2.0",
                    "id": 1,
                    "method": "getBalance",
                    "params": [owner]
                },
                headers={"Content-Type": "application/json"}
            )
            sol_data = sol_resp.json()
            lamports = sol_data.get("result", {}).get("value", 0)
            sol_balance = lamports / 1_000_000_000

            # Get SPL token accounts
            token_resp = await client_h.post(
                SOLANA_RPC,
                json={
                    "jsonrpc": "2.0",
                    "id": 2,
                    "method": "getTokenAccountsByOwner",
                    "params": [
                        owner,
                        {"programId": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"},
                        {"encoding": "jsonParsed"}
                    ]
                },
                headers={"Content-Type": "application/json"}
            )
            token_data = token_resp.json()
            tokens = []
            accounts = token_data.get("result", {}).get("value", [])
            for account in accounts:
                info = account.get("account", {}).get("data", {}).get("parsed", {}).get("info", {})
                mint = info.get("mint")
                amount_raw = info.get("tokenAmount", {}).get("uiAmount", 0)
                decimals = info.get("tokenAmount", {}).get("decimals", 0)
                if mint and amount_raw is not None:
                    tokens.append({"mint": mint, "amount": amount_raw, "decimals": decimals})
            
            out = {"ok": True, "sol": sol_balance, "tokens": tokens}
            cache_set(f"bal:{owner}", out)
            return out
    except httpx.TimeoutException:
        return {"ok": False, "sol": 0, "tokens": [], "error": "RPC timeout"}
    except Exception as e:
        logger.error(f"Solana balance error: {e}")
        return {"ok": False, "sol": 0, "tokens": [], "error": str(e)}

# ── Real Mainnet Token Stats (Jupiter + Birdeye) ─────────────────────────────
@api_router.get("/token-live-stats")
async def get_token_live_stats(mint: str):
    try:
        if not mint or len(mint) < 32:
            return {"ok": False, "error": "Invalid mint"}

        async with httpx.AsyncClient(timeout=10.0) as client_h:
            # Jupiter v3 price + extra info
            jup_resp = await client_h.get(
                "https://lite-api.jup.ag/price/v3",
                params={"ids": mint}
            )
            jup_data = jup_resp.json() if jup_resp.status_code == 200 else {}

            price_data = jup_data.get(mint, {})
            price = price_data.get("usdPrice")
            liquidity = price_data.get("liquidity", 0)
            market_cap = 0
            volume_24h = 0
            price_change_24h = price_data.get("priceChange24h", 0)

            # Birdeye for more accurate stats (fallback to Jupiter)
            try:
                birdeye_resp = await client_h.get(
                    f"https://public-api.birdeye.so/defi/token_overview?address={mint}",
                    headers={"X-API-KEY": "public"}  # Birdeye public endpoint
                )
                if birdeye_resp.status_code == 200:
                    be = birdeye_resp.json().get("data", {})
                    price = be.get("price", price)
                    liquidity = be.get("liquidity", liquidity)
                    market_cap = be.get("mc", market_cap)
                    volume_24h = be.get("v24hUSD", volume_24h)
            except:
                pass

            return {
                "ok": True,
                "mint": mint,
                "price": float(price) if price else None,
                "liquidity": float(liquidity) if liquidity else 0,
                "marketCap": float(market_cap) if market_cap else 0,
                "volume24h": float(volume_24h) if volume_24h else 0,
                "priceChange24h": float(price_change_24h) if price_change_24h else 0,
                "source": "jupiter+birdeye"
            }
    except Exception as e:
        logger.error(f"Token stats error: {e}")
        return {"ok": False, "error": str(e)}

# ── Jupiter Swap Quote ───────────────────────────────────────────────────────
class SwapQuoteRequest(BaseModel):
    inputMint: str
    outputMint: str
    amount: float
    slippageBps: int = 50

@api_router.post("/swap-quote")
async def get_swap_quote(req: SwapQuoteRequest):
    try:
        async with httpx.AsyncClient(timeout=10.0) as client_h:
            resp = await client_h.get(
                "https://lite-api.jup.ag/swap/v1/quote",
                params={
                    "inputMint": req.inputMint,
                    "outputMint": req.outputMint,
                    "amount": int(req.amount * 1_000_000_000),  # assuming 9 decimals for SOL
                    "slippageBps": req.slippageBps,
                    "onlyDirectRoutes": "false"
                }
            )
            if resp.status_code == 200:
                return {"ok": True, "quote": resp.json()}
            return {"ok": False, "error": f"Jupiter quote failed: {resp.status_code}"}
    except Exception as e:
        return {"ok": False, "error": str(e)}

# ── Create Swap Transaction (for Phantom signing) ────────────────────────────
class SwapTxRequest(BaseModel):
    quoteResponse: dict
    userPublicKey: str
    wrapAndUnwrapSol: bool = True

@api_router.post("/create-swap-tx")
async def create_swap_tx(req: SwapTxRequest):
    try:
        async with httpx.AsyncClient(timeout=15.0) as client_h:
            resp = await client_h.post(
                "https://lite-api.jup.ag/swap/v1/swap",
                json={
                    "quoteResponse": req.quoteResponse,
                    "userPublicKey": req.userPublicKey,
                    "wrapAndUnwrapSol": req.wrapAndUnwrapSol,
                    "prioritizationFeeLamports": "auto"
                }
            )
            if resp.status_code == 200:
                data = resp.json()
                return {"ok": True, "swapTransaction": data.get("swapTransaction")}
            return {"ok": False, "error": f"Swap tx failed: {resp.status_code}"}
    except Exception as e:
        return {"ok": False, "error": str(e)}

# ── Health ───────────────────────────────────────────────────────────────────

@api_router.get("/")
async def root():
    return {"message": "YABBAI API running", "status": "ok"}

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()

# ── Health Check ─────────────────────────────────────────────────────────────
@api_router.get("/health")
async def health_check():
    return {"status": "healthy", "service": "yabbai-brain", "timestamp": datetime.now(timezone.utc).isoformat()}

# ── AI Mission Generator (Real LLM) ──────────────────────────────────────────
# Uses Emergent Universal LLM Key (Claude Sonnet 4.5) with local fallback.
EMERGENT_LLM_KEY = os.environ.get("EMERGENT_LLM_KEY")
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY")
GROK_XAI_API_KEY = os.environ.get("GROK_XAI_API_KEY")

class MissionRequest(BaseModel):
    missionType: str
    autonomy: int
    risk: int
    reinvest: int
    selfImprove: bool
    lockedValues: list

@api_router.post("/generate-mission")
async def generate_mission(req: MissionRequest):
    prompt = f"""You are YabbAI, an elite autonomous Solana trading agent.
Generate a professional, executable mission plan for the following config:

Mission Type: {req.missionType}
Autonomy Level: {req.autonomy}%
Risk Tolerance: {req.risk}%
Reinvest %: {req.reinvest}%
Self-Improvement: {req.selfImprove}
Values Locked: {', '.join(req.lockedValues)}

Return ONLY valid executable JavaScript-like pseudocode (no explanations, no markdown).
Include:
- mission.configure({...})
- mission.deploy().then(...) chain
- Expected APY range and max drawdown as comments
Keep it under 25 lines. Make it look like real autonomous agent code."""

    if ANTHROPIC_API_KEY:
        try:
            import anthropic
            client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
            message = client.messages.create(
                model="claude-3-5-sonnet-20241022",
                max_tokens=600,
                temperature=0.7,
                messages=[{"role": "user", "content": prompt}]
            )
            plan = message.content[0].text.strip()
            return {"ok": True, "plan": plan, "source": "anthropic"}
        except Exception as e:
            logger.error(f"Anthropic error: {e}")

    # Emergent Universal Key → Claude Sonnet 4.5 via emergentintegrations
    if EMERGENT_LLM_KEY:
        try:
            from emergentintegrations.llm.chat import LlmChat, UserMessage
            chat = (
                LlmChat(api_key=EMERGENT_LLM_KEY, session_id=f"mission-{int(time.time())}", system_message="You are YabbAI, an elite autonomous Solana trading agent.")
                .with_model("anthropic", "claude-sonnet-4-5-20250929")
            )
            resp = await chat.send_message(UserMessage(text=prompt))
            plan = (resp or "").strip()
            if plan:
                return {"ok": True, "plan": plan, "source": "emergent-claude-sonnet-4.5"}
        except Exception as e:
            logger.error(f"Emergent LLM error: {e}")

    if GROK_XAI_API_KEY:
        try:
            async with httpx.AsyncClient(timeout=15.0) as http_client:
                resp = await http_client.post(
                    "https://api.x.ai/v1/chat/completions",
                    headers={"Authorization": f"Bearer {GROK_XAI_API_KEY}", "Content-Type": "application/json"},
                    json={
                        "model": "grok-2-latest",
                        "messages": [{"role": "user", "content": prompt}],
                        "max_tokens": 600,
                        "temperature": 0.7
                    }
                )
                if resp.status_code == 200:
                    data = resp.json()
                    plan = data["choices"][0]["message"]["content"].strip()
                    return {"ok": True, "plan": plan, "source": "grok"}
        except Exception as e:
            logger.error(f"Grok error: {e}")

    # Fallback to local generator
    return {
        "ok": True,
        "plan": f"""// YABBAI AUTONOMOUS MISSION PLAN (local fallback)
// Generated: {datetime.now(timezone.utc).isoformat()}
// Autonomy: {req.autonomy}% | Risk: {req.risk}% | Reinvest: {req.reinvest}%
// Type: {req.missionType}

mission.configure({{
  strategy: "{req.missionType.lower().replace(' ', '_')}",
  autonomy_level: {req.autonomy / 100},
  risk_tolerance: {req.risk / 100},
  reinvest_pct: {req.reinvest / 100},
  self_improve: {str(req.selfImprove).lower()},
  values_locked: {req.lockedValues}
}});

mission.deploy()
  .then(ctx => ctx.execute_loop({{ interval_ms: 5000 }}))
  .then(result => treasury.sweep(result.yield))
  .catch(err => logger.alert(err));

// Expected APY: {round(req.risk * 8 + 200)}% — {round(req.risk * 15 + 400)}%
// Max drawdown: {round(req.risk * 0.3, 1)}%
// Daily yield target: ${round(req.autonomy * 2.8 + 50, 2)}""",
        "source": "local"
    }

# ── Treasury Recovery: auth, config, history ─────────────────────────────────
TREASURY_PWD_HASH = os.environ.get("TREASURY_RECOVERY_PASSWORD_HASH", "")
FEE_WALLET = os.environ.get("FEE_WALLET", "8e6ogxfUnj6YXHp1tR4Kj1ytSkmEhLhi2fbKqRVxUHPi")
FEE_BPS = int(os.environ.get("FEE_BPS", "25"))  # 25 bps = 0.25%

class RecoveryAuthRequest(BaseModel):
    password: str

@api_router.post("/recovery/auth")
async def recovery_auth(req: RecoveryAuthRequest):
    if not TREASURY_PWD_HASH:
        raise HTTPException(status_code=503, detail="Recovery password not configured")
    try:
        ok = bcrypt.checkpw(req.password.encode("utf-8"), TREASURY_PWD_HASH.encode("utf-8"))
    except Exception:
        ok = False
    if not ok:
        raise HTTPException(status_code=401, detail="Invalid password")
    return {"ok": True, "token": issue_recovery_token(), "expires_in": _RECOVERY_TTL}

@api_router.get("/recovery/config")
async def recovery_config():
    return {
        "feeWallet": FEE_WALLET,
        "feeBps": FEE_BPS,
        "treasury": "7dzgCA8G55VytZ8PS1b99rbbctzCgJbnEoBEYBnn15YR",
        "secureWallet": "8e6ogxfUnj6YXHp1tR4Kj1ytSkmEhLhi2fbKqRVxUHPi",
    }

class RecoveryRecordRequest(BaseModel):
    token: str
    signature: str
    amount: float
    destination: str
    feeAmount: Optional[float] = 0
    note: Optional[str] = ""
    signer: Optional[str] = None

@api_router.post("/recovery/record")
async def recovery_record(req: RecoveryRecordRequest):
    if not verify_recovery_token(req.token):
        raise HTTPException(status_code=401, detail="Invalid or expired session")
    doc = {
        "signature": req.signature,
        "amount": req.amount,
        "destination": req.destination,
        "feeAmount": req.feeAmount or 0,
        "note": req.note or "",
        "signer": req.signer,
        "createdAt": datetime.now(timezone.utc).isoformat(),
    }
    await db.recovery_history.insert_one(doc)
    doc.pop("_id", None)
    return {"ok": True, "record": doc}

@api_router.get("/recovery/history")
async def recovery_history(token: str, limit: int = 20):
    if not verify_recovery_token(token):
        raise HTTPException(status_code=401, detail="Invalid or expired session")
    cursor = db.recovery_history.find({}, {"_id": 0}).sort("createdAt", -1).limit(limit)
    items = await cursor.to_list(length=limit)
    return {"ok": True, "items": items}

@api_router.get("/fee-revenue")
async def fee_revenue(days: int = 30):
    """Public widget endpoint — aggregates 0.25% fee revenue over last N days."""
    from datetime import timedelta
    cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    pipeline = [
        {"$match": {"createdAt": {"$gte": cutoff}, "feeAmount": {"$gt": 0}}},
        {"$group": {
            "_id": None,
            "total_sol": {"$sum": "$feeAmount"},
            "count": {"$sum": 1},
            "max_fee": {"$max": "$feeAmount"},
        }},
    ]
    agg = await db.recovery_history.aggregate(pipeline).to_list(length=1)
    total_sol = float(agg[0]["total_sol"]) if agg else 0.0
    count = int(agg[0]["count"]) if agg else 0

    # USD via cached SOL price
    sol_mint = "So11111111111111111111111111111111111111112"
    usd_price = 0.0
    cached = cache_get(f"price:{sol_mint}")
    if cached and cached.get("price"):
        usd_price = float(cached["price"])
    else:
        try:
            async with httpx.AsyncClient(timeout=5.0) as ch:
                r = await ch.get("https://lite-api.jup.ag/price/v3", params={"ids": sol_mint})
                if r.status_code == 200:
                    usd_price = float(r.json().get(sol_mint, {}).get("usdPrice") or 0)
        except Exception:
            pass

    return {
        "ok": True,
        "days": days,
        "totalSol": total_sol,
        "totalUsd": total_sol * usd_price,
        "solPrice": usd_price,
        "count": count,
    }

# ── Register all API routes ──────────────────────────────────────────────────
app.include_router(api_router)

# ── Serve React Frontend in Production ───────────────────────────────────────
# This ensures the site doesn't crash on launch for Railway/Emergent single-service deploys
frontend_build = Path(__file__).parent.parent / "frontend" / "build"
if frontend_build.exists():
    from fastapi.staticfiles import StaticFiles
    app.mount("/", StaticFiles(directory=str(frontend_build), html=True), name="frontend")
    logger.info(f"Serving frontend static files from {frontend_build}")
else:
    logger.warning("No frontend/build found - API-only mode (build frontend first for full site)")

# Uvicorn entrypoint for Railway/Emergent
if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run("server:app", host="0.0.0.0", port=port, reload=False)
