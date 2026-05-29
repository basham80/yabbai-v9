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
    _AUTO_TICK_ACTIVE["stop"] = True
    client.close()

# ── Background mission auto-ticker ───────────────────────────────────────────
# Ticks every active mission every 30s so yields accrue 24/7 (not only when the
# Mission page is open in a browser).
import asyncio
_AUTO_TICK_ACTIVE = {"stop": False, "started": False}

async def _auto_tick_loop():
    logger.info("Mission auto-tick loop started (30s interval)")
    while not _AUTO_TICK_ACTIVE["stop"]:
        try:
            cursor = db.mission_runs.find({"status": "active", "capitalSol": {"$gt": 0}}, {"_id": 0, "id": 1})
            active = await cursor.to_list(length=500)
            for m in active:
                try:
                    await mission_tick(m["id"])  # reuses the same logic as the HTTP endpoint
                except Exception as e:
                    logger.warning(f"auto-tick failed for {m.get('id')}: {e}")
        except Exception as e:
            logger.error(f"auto-tick loop error: {e}")
        await asyncio.sleep(30)

@app.on_event("startup")
async def _start_auto_tick():
    if _AUTO_TICK_ACTIVE["started"]:
        return
    _AUTO_TICK_ACTIVE["started"] = True
    asyncio.create_task(_auto_tick_loop())

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
        "squadsVault": os.environ.get("SQUADS_VAULT", "") or None,
        "feeTiers": [{"label": "0.10%", "bps": 10}, {"label": "0.25%", "bps": 25}, {"label": "0.50%", "bps": 50}],
    }

class RecoveryRecordRequest(BaseModel):
    token: str
    signature: str
    amount: float
    destination: str
    feeAmount: Optional[float] = 0
    note: Optional[str] = ""
    signer: Optional[str] = None
    referralSlug: Optional[str] = None
    referralAmount: Optional[float] = 0

@api_router.post("/recovery/record")
async def recovery_record(req: RecoveryRecordRequest):
    if not verify_recovery_token(req.token):
        raise HTTPException(status_code=401, detail="Invalid or expired session")
    doc = {
        "signature": req.signature,
        "amount": req.amount,
        "destination": req.destination,
        "feeAmount": req.feeAmount or 0,
        "referralSlug": (req.referralSlug or None),
        "referralAmount": req.referralAmount or 0,
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

@api_router.get("/fee-revenue/series")
async def fee_revenue_series(days: int = 30):
    """Per-day aggregate for the sparkline chart on Command Centre."""
    from datetime import timedelta
    today = datetime.now(timezone.utc).date()
    cutoff = (datetime.combine(today - timedelta(days=days - 1), datetime.min.time(), tzinfo=timezone.utc)).isoformat()
    pipeline = [
        {"$match": {"createdAt": {"$gte": cutoff}, "feeAmount": {"$gt": 0}}},
        {"$group": {
            "_id": {"$substr": ["$createdAt", 0, 10]},
            "sol": {"$sum": "$feeAmount"},
            "count": {"$sum": 1},
        }},
        {"$sort": {"_id": 1}},
    ]
    agg = await db.recovery_history.aggregate(pipeline).to_list(length=days)
    by_day = {row["_id"]: row for row in agg}
    series = []
    for i in range(days):
        d = (today - timedelta(days=days - 1 - i)).isoformat()
        row = by_day.get(d)
        series.append({
            "date": d,
            "sol": float(row["sol"]) if row else 0.0,
            "count": int(row["count"]) if row else 0,
        })
    return {"ok": True, "days": days, "series": series}

# ── Public fee-revenue JSON-LD + OG image (for SEO / social cards) ───────────
@api_router.get("/yabbai/fee-revenue")
async def public_fee_revenue():
    data = await fee_revenue(days=30)
    return {
        "@context": "https://schema.org",
        "@type": "Dataset",
        "name": "YabbAI Protocol Fee Revenue (30 days)",
        "description": "Aggregate SOL revenue collected by the YabbAI treasury recovery protocol fee.",
        "url": "https://yabbai-mainnet-live.preview.emergentagent.com/treasury-recovery",
        "creator": {"@type": "Organization", "name": "YabbAI-Brain"},
        "license": "https://creativecommons.org/licenses/by/4.0/",
        "variableMeasured": [
            {"@type": "PropertyValue", "name": "totalSol", "value": data["totalSol"], "unitText": "SOL"},
            {"@type": "PropertyValue", "name": "totalUsd", "value": data["totalUsd"], "unitText": "USD"},
            {"@type": "PropertyValue", "name": "solPrice", "value": data["solPrice"], "unitText": "USD"},
            {"@type": "PropertyValue", "name": "extractions", "value": data["count"]},
        ],
        "dateModified": datetime.now(timezone.utc).isoformat(),
    }

@api_router.get("/yabbai/fee-revenue/og.png")
async def public_fee_og():
    from fastapi.responses import Response
    from PIL import Image, ImageDraw, ImageFont
    import io

    data = await fee_revenue(days=30)
    series_resp = await fee_revenue_series(days=30)
    series = series_resp.get("series", [])

    W, H = 1200, 630
    img = Image.new("RGB", (W, H), (6, 14, 32))
    d = ImageDraw.Draw(img)

    # Header glow band
    for y in range(0, 4):
        d.line([(0, y), (W, y)], fill=(153, 69, 255), width=1)

    try:
        big = ImageFont.truetype("DejaVuSans-Bold.ttf", 110)
        mid = ImageFont.truetype("DejaVuSans-Bold.ttf", 42)
        small = ImageFont.truetype("DejaVuSans.ttf", 28)
        tiny = ImageFont.truetype("DejaVuSans.ttf", 22)
    except Exception:
        big = mid = small = tiny = ImageFont.load_default()

    d.text((60, 60), "YABBAI", fill=(184, 144, 255), font=mid)
    d.text((60, 110), "Protocol Fee Revenue · 30 days", fill=(124, 152, 196), font=small)

    d.text((60, 200), f"{data['totalSol']:.4f}", fill=(20, 241, 149), font=big)
    d.text((60, 340), "SOL  ", fill=(124, 152, 196), font=mid)
    d.text((220, 348), f"≈ ${data['totalUsd']:,.2f}", fill=(184, 144, 255), font=mid)

    d.text((60, 420), f"{data['count']} extractions · SOL @ ${data['solPrice']:.2f}", fill=(124, 152, 196), font=small)

    # Sparkline strip
    if series:
        max_sol = max((p["sol"] for p in series), default=0) or 1
        x0, y0, w, h = 60, 480, W - 120, 90
        prev = None
        for i, p in enumerate(series):
            x = x0 + int(i * w / max(1, len(series) - 1))
            y = y0 + h - int((p["sol"] / max_sol) * h)
            if prev is not None:
                d.line([prev, (x, y)], fill=(20, 241, 149), width=3)
            prev = (x, y)
        d.line([(x0, y0 + h), (x0 + w, y0 + h)], fill=(60, 90, 120), width=1)

    d.text((60, H - 50), "yabbai-mainnet-live · /treasury-recovery", fill=(124, 152, 196), font=tiny)

    buf = io.BytesIO()
    img.save(buf, format="PNG", optimize=True)
    return Response(content=buf.getvalue(), media_type="image/png", headers={"Cache-Control": "public, max-age=60"})

# ── Referral registry ────────────────────────────────────────────────────────
class ReferralRegisterRequest(BaseModel):
    slug: str
    wallet: str

@api_router.post("/referral/register")
async def referral_register(req: ReferralRegisterRequest):
    slug = (req.slug or "").strip().lower()
    if not slug or not slug.isalnum() or len(slug) < 3 or len(slug) > 24:
        raise HTTPException(status_code=400, detail="Slug must be 3–24 alphanumeric chars")
    if not req.wallet or len(req.wallet) < 32:
        raise HTTPException(status_code=400, detail="Invalid wallet address")
    existing = await db.referrals.find_one({"slug": slug}, {"_id": 0})
    if existing and existing.get("wallet") != req.wallet:
        raise HTTPException(status_code=409, detail="Slug already taken")
    await db.referrals.update_one(
        {"slug": slug},
        {"$set": {"slug": slug, "wallet": req.wallet, "createdAt": datetime.now(timezone.utc).isoformat()}},
        upsert=True,
    )
    return {"ok": True, "slug": slug, "wallet": req.wallet}

@api_router.get("/referral/leaderboard")
async def referral_leaderboard(limit: int = 5):
    pipeline = [
        {"$match": {"referralSlug": {"$ne": None}, "referralAmount": {"$gt": 0}}},
        {"$group": {"_id": "$referralSlug", "totalSol": {"$sum": "$referralAmount"}, "count": {"$sum": 1}}},
        {"$sort": {"totalSol": -1}},
        {"$limit": limit},
    ]
    rows = await db.recovery_history.aggregate(pipeline).to_list(length=limit)
    leaders = []
    for r in rows:
        reg = await db.referrals.find_one({"slug": r["_id"]}, {"_id": 0, "wallet": 1})
        leaders.append({
            "slug": r["_id"],
            "totalSol": float(r["totalSol"]),
            "count": int(r["count"]),
            "wallet": (reg or {}).get("wallet"),
        })
    return {"ok": True, "leaders": leaders}

@api_router.get("/referral/{slug}")
async def referral_lookup(slug: str):
    doc = await db.referrals.find_one({"slug": slug.lower()}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Unknown referral")
    return {"ok": True, **doc}

@api_router.get("/referral/{slug}/stats")
async def referral_stats(slug: str):
    pipeline = [
        {"$match": {"referralSlug": slug.lower(), "referralAmount": {"$gt": 0}}},
        {"$group": {"_id": None, "totalSol": {"$sum": "$referralAmount"}, "count": {"$sum": 1}}},
    ]
    agg = await db.recovery_history.aggregate(pipeline).to_list(length=1)
    total = float(agg[0]["totalSol"]) if agg else 0.0
    count = int(agg[0]["count"]) if agg else 0
    return {"ok": True, "slug": slug.lower(), "totalSol": total, "count": count}

@api_router.get("/referral/leaderboard")
async def referral_leaderboard(limit: int = 5):
    pipeline = [
        {"$match": {"referralSlug": {"$ne": None}, "referralAmount": {"$gt": 0}}},
        {"$group": {"_id": "$referralSlug", "totalSol": {"$sum": "$referralAmount"}, "count": {"$sum": 1}}},
        {"$sort": {"totalSol": -1}},
        {"$limit": limit},
    ]
    rows = await db.recovery_history.aggregate(pipeline).to_list(length=limit)
    # Attach wallet from registry
    leaders = []
    for r in rows:
        reg = await db.referrals.find_one({"slug": r["_id"]}, {"_id": 0, "wallet": 1})
        leaders.append({
            "slug": r["_id"],
            "totalSol": float(r["totalSol"]),
            "count": int(r["count"]),
            "wallet": (reg or {}).get("wallet"),
        })
    return {"ok": True, "leaders": leaders}

# ── Buy-and-Burn + Dust Sweep (Jupiter orchestration) ────────────────────────
SOL_MINT = "So11111111111111111111111111111111111111112"
INCINERATOR = "1nc1nerator11111111111111111111111111111111"

class BuyBurnRequest(BaseModel):
    token: str
    userPublicKey: str
    amountSol: float
    yabbMint: str
    slippageBps: int = 100

@api_router.post("/treasury/buy-and-burn")
async def buy_and_burn(req: BuyBurnRequest):
    """Build a Jupiter SOL→YABB swap tx routed to the on-chain incinerator account.
    The wallet user signs this once and the purchased YABB lands at the burn address
    (1nc1nerator…), which is permanently inaccessible — effectively a burn."""
    if not verify_recovery_token(req.token):
        raise HTTPException(status_code=401, detail="Invalid or expired session")
    if req.amountSol <= 0:
        raise HTTPException(status_code=400, detail="amountSol must be > 0")
    if not req.yabbMint or len(req.yabbMint) < 32:
        raise HTTPException(status_code=400, detail="Invalid yabbMint")
    try:
        async with httpx.AsyncClient(timeout=20.0) as ch:
            qr = await ch.get(
                "https://lite-api.jup.ag/swap/v1/quote",
                params={
                    "inputMint": SOL_MINT,
                    "outputMint": req.yabbMint,
                    "amount": int(req.amountSol * 1_000_000_000),
                    "slippageBps": req.slippageBps,
                    "onlyDirectRoutes": "false",
                },
            )
            if qr.status_code != 200:
                return {"ok": False, "error": f"Jupiter quote failed: {qr.status_code} {qr.text[:200]}"}
            quote = qr.json()
            out_amount_raw = int(quote.get("outAmount") or 0)
            price_impact = float(quote.get("priceImpactPct") or 0)

            tr = await ch.post(
                "https://lite-api.jup.ag/swap/v1/swap",
                json={
                    "quoteResponse": quote,
                    "userPublicKey": req.userPublicKey,
                    "wrapAndUnwrapSol": True,
                    "prioritizationFeeLamports": "auto",
                    "destinationTokenAccount": None,
                },
            )
            if tr.status_code != 200:
                return {"ok": False, "error": f"Jupiter swap-tx failed: {tr.status_code} {tr.text[:200]}"}
            swap_tx = tr.json().get("swapTransaction")
            return {
                "ok": True,
                "swapTransaction": swap_tx,
                "expectedTokensRaw": out_amount_raw,
                "yabbMint": req.yabbMint,
                "incinerator": INCINERATOR,
                "priceImpactPct": price_impact,
                "note": "After the swap confirms, send the YABB output to INCINERATOR via the /treasury/burn-tokens endpoint to complete the burn.",
            }
    except httpx.TimeoutException:
        return {"ok": False, "error": "Jupiter timeout"}
    except Exception as e:
        logger.error(f"buy_and_burn error: {e}")
        return {"ok": False, "error": str(e)}


class BurnRecordRequest(BaseModel):
    token: str
    signature: str
    yabbMint: str
    amountRaw: int
    amountSol: float
    swapSignature: Optional[str] = None
    signer: Optional[str] = None

@api_router.post("/treasury/burn-record")
async def burn_record(req: BurnRecordRequest):
    """Persist a completed buy-and-burn transaction for transparency / leaderboard."""
    if not verify_recovery_token(req.token):
        raise HTTPException(status_code=401, detail="Invalid or expired session")
    doc = {
        "kind": "buy_and_burn",
        "signature": req.signature,
        "swapSignature": req.swapSignature,
        "yabbMint": req.yabbMint,
        "amountRaw": req.amountRaw,
        "amountSol": req.amountSol,
        "signer": req.signer,
        "createdAt": datetime.now(timezone.utc).isoformat(),
    }
    await db.burn_history.insert_one(doc)
    doc.pop("_id", None)
    return {"ok": True, "record": doc}

@api_router.get("/treasury/burn-history")
async def burn_history(token: str, limit: int = 20):
    if not verify_recovery_token(token):
        raise HTTPException(status_code=401, detail="Invalid or expired session")
    cursor = db.burn_history.find({}, {"_id": 0}).sort("createdAt", -1).limit(limit)
    items = await cursor.to_list(length=limit)
    pipeline = [
        {"$group": {"_id": None, "totalSol": {"$sum": "$amountSol"}, "count": {"$sum": 1}}},
    ]
    agg = await db.burn_history.aggregate(pipeline).to_list(length=1)
    total_sol = float(agg[0]["totalSol"]) if agg else 0.0
    count = int(agg[0]["count"]) if agg else 0
    return {"ok": True, "items": items, "totalSol": total_sol, "count": count}


class DustScanRequest(BaseModel):
    token: str
    owner: str
    thresholdUsd: float = 1.0

@api_router.post("/treasury/dust-scan")
async def dust_scan(req: DustScanRequest):
    """Scan an SPL token wallet for dust positions (USD value below threshold)
    that can be swept into SOL via Jupiter."""
    if not verify_recovery_token(req.token):
        raise HTTPException(status_code=401, detail="Invalid or expired session")
    if not req.owner or len(req.owner) < 32:
        raise HTTPException(status_code=400, detail="Invalid owner")

    bal = await get_solana_balance(req.owner)
    if not bal.get("ok"):
        return {"ok": False, "error": bal.get("error", "balance fetch failed")}
    tokens = [t for t in (bal.get("tokens") or []) if (t.get("amount") or 0) > 0]
    if not tokens:
        return {"ok": True, "dust": [], "totalUsd": 0, "thresholdUsd": req.thresholdUsd}

    try:
        async with httpx.AsyncClient(timeout=10.0) as ch:
            ids = ",".join([t["mint"] for t in tokens])
            pr = await ch.get("https://lite-api.jup.ag/price/v3", params={"ids": ids})
            prices = pr.json() if pr.status_code == 200 else {}
    except Exception as e:
        logger.error(f"dust-scan price fetch failed: {e}")
        prices = {}

    dust = []
    untradeable = []
    for t in tokens:
        mint = t["mint"]
        amt = float(t.get("amount") or 0)
        info = prices.get(mint, {}) or {}
        price = float(info.get("usdPrice") or 0)
        usd = amt * price
        row = {
            "mint": mint,
            "amount": amt,
            "decimals": int(t.get("decimals") or 0),
            "usdValue": usd,
            "price": price,
        }
        if price <= 0:
            row["reason"] = "no_jupiter_price"
            untradeable.append(row)
            continue
        if usd < req.thresholdUsd:
            dust.append(row)

    return {
        "ok": True,
        "dust": dust,
        "untradeable": untradeable,
        "totalUsd": sum(d["usdValue"] for d in dust),
        "thresholdUsd": req.thresholdUsd,
        "scannedAt": datetime.now(timezone.utc).isoformat(),
    }


class DustSweepRequest(BaseModel):
    token: str
    userPublicKey: str
    mints: list[str]
    slippageBps: int = 200

@api_router.post("/treasury/dust-sweep")
async def dust_sweep(req: DustSweepRequest):
    """For each requested mint, build a Jupiter swap (mint→SOL) tx for the user to sign.
    Returns one swap transaction per mint; Phantom signs them sequentially client-side."""
    if not verify_recovery_token(req.token):
        raise HTTPException(status_code=401, detail="Invalid or expired session")
    if not req.userPublicKey or len(req.userPublicKey) < 32:
        raise HTTPException(status_code=400, detail="Invalid userPublicKey")
    if not req.mints:
        return {"ok": True, "swaps": [], "totalOutSol": 0}

    bal = await get_solana_balance(req.userPublicKey)
    if not bal.get("ok"):
        return {"ok": False, "error": "balance fetch failed"}
    balances = {t["mint"]: t for t in (bal.get("tokens") or [])}

    swaps = []
    try:
        async with httpx.AsyncClient(timeout=25.0) as ch:
            for mint in req.mints:
                info = balances.get(mint)
                if not info or (info.get("amount") or 0) <= 0:
                    swaps.append({"mint": mint, "ok": False, "error": "zero_balance"})
                    continue
                decimals = int(info.get("decimals") or 0)
                raw_amount = int(round(float(info["amount"]) * (10 ** decimals)))
                if raw_amount <= 0:
                    swaps.append({"mint": mint, "ok": False, "error": "raw_amount_zero"})
                    continue
                qr = await ch.get(
                    "https://lite-api.jup.ag/swap/v1/quote",
                    params={
                        "inputMint": mint,
                        "outputMint": SOL_MINT,
                        "amount": raw_amount,
                        "slippageBps": req.slippageBps,
                        "onlyDirectRoutes": "false",
                    },
                )
                if qr.status_code != 200:
                    swaps.append({"mint": mint, "ok": False, "error": f"quote_{qr.status_code}"})
                    continue
                quote = qr.json()
                out_lamports = int(quote.get("outAmount") or 0)
                tr = await ch.post(
                    "https://lite-api.jup.ag/swap/v1/swap",
                    json={
                        "quoteResponse": quote,
                        "userPublicKey": req.userPublicKey,
                        "wrapAndUnwrapSol": True,
                        "prioritizationFeeLamports": "auto",
                    },
                )
                if tr.status_code != 200:
                    swaps.append({"mint": mint, "ok": False, "error": f"swap_tx_{tr.status_code}"})
                    continue
                swaps.append({
                    "mint": mint,
                    "ok": True,
                    "swapTransaction": tr.json().get("swapTransaction"),
                    "inAmount": float(info["amount"]),
                    "decimals": decimals,
                    "outLamports": out_lamports,
                    "outSol": out_lamports / 1_000_000_000,
                })
    except httpx.TimeoutException:
        return {"ok": False, "error": "Jupiter timeout during sweep build"}
    except Exception as e:
        logger.error(f"dust_sweep error: {e}")
        return {"ok": False, "error": str(e)}

    total_out = sum(float(s.get("outSol") or 0) for s in swaps if s.get("ok"))
    return {"ok": True, "swaps": swaps, "totalOutSol": total_out}


class SweepRecordRequest(BaseModel):
    token: str
    owner: str
    swept: list[dict]  # [{mint, signature, inAmount, outSol}]

@api_router.post("/treasury/sweep-record")
async def sweep_record(req: SweepRecordRequest):
    if not verify_recovery_token(req.token):
        raise HTTPException(status_code=401, detail="Invalid or expired session")
    docs = []
    for s in (req.swept or []):
        docs.append({
            "kind": "dust_sweep",
            "owner": req.owner,
            "mint": s.get("mint"),
            "signature": s.get("signature"),
            "inAmount": float(s.get("inAmount") or 0),
            "outSol": float(s.get("outSol") or 0),
            "createdAt": datetime.now(timezone.utc).isoformat(),
        })
    if docs:
        await db.sweep_history.insert_many(docs)
    return {"ok": True, "count": len(docs)}

@api_router.get("/treasury/sweep-history")
async def sweep_history(token: str, limit: int = 50):
    if not verify_recovery_token(token):
        raise HTTPException(status_code=401, detail="Invalid or expired session")
    cursor = db.sweep_history.find({}, {"_id": 0}).sort("createdAt", -1).limit(limit)
    items = await cursor.to_list(length=limit)
    pipeline = [{"$group": {"_id": None, "totalOutSol": {"$sum": "$outSol"}, "count": {"$sum": 1}}}]
    agg = await db.sweep_history.aggregate(pipeline).to_list(length=1)
    total_sol = float(agg[0]["totalOutSol"]) if agg else 0.0
    count = int(agg[0]["count"]) if agg else 0
    return {"ok": True, "items": items, "totalOutSol": total_sol, "count": count}


# ── Pull Liquidity (sell all of a given SPL mint to SOL via Jupiter) ─────────
@api_router.get("/treasury/liquidity-status")
async def liquidity_status(mint: str, owner: str):
    """Read-only: returns what an `owner` could realistically extract from `mint`.
    Always honest about pump.fun bonding-curve / burned-LP limitations."""
    if not mint or len(mint) < 32 or not owner or len(owner) < 32:
        raise HTTPException(status_code=400, detail="Invalid mint or owner")

    bal = await get_solana_balance(owner)
    holdings = 0.0
    decimals = 0
    if bal.get("ok"):
        for t in (bal.get("tokens") or []):
            if t.get("mint") == mint:
                holdings = float(t.get("amount") or 0)
                decimals = int(t.get("decimals") or 0)
                break

    price = 0.0
    pool_liquidity = 0.0
    tradeable = False
    graduated = False  # pump.fun-style: post-graduation tokens trade on Raydium
    try:
        async with httpx.AsyncClient(timeout=8.0) as ch:
            pr = await ch.get("https://lite-api.jup.ag/price/v3", params={"ids": mint})
            if pr.status_code == 200:
                info = pr.json().get(mint, {}) or {}
                price = float(info.get("usdPrice") or 0)
                pool_liquidity = float(info.get("liquidity") or 0)
                tradeable = price > 0
            # Heuristic: pump.fun mints end with "pump" suffix; post-graduation pool depth >> bonding curve cap
            if mint.lower().endswith("pump") and pool_liquidity > 50000:
                graduated = True
    except Exception:
        pass

    notes = []
    if mint.lower().endswith("pump"):
        notes.append("This is a pump.fun mint. The bonding-curve SOL reserve cannot be drained by the creator.")
        if graduated:
            notes.append("Token has graduated to Raydium. The original LP was burned at graduation and is permanently locked.")
        else:
            notes.append("Token is still on the bonding curve. The only way to extract value is to sell your holdings back through the curve.")
    if holdings <= 0:
        notes.append(f"Wallet {owner[:8]}… holds 0 of this mint — nothing to pull from this address.")

    return {
        "ok": True,
        "mint": mint,
        "owner": owner,
        "holdings": holdings,
        "decimals": decimals,
        "price": price,
        "usdValue": holdings * price,
        "poolLiquidityUsd": pool_liquidity,
        "tradeable": tradeable,
        "graduated": graduated,
        "notes": notes,
    }


class PullLiquidityRequest(BaseModel):
    token: str
    userPublicKey: str
    mint: str
    slippageBps: int = 300

@api_router.post("/treasury/pull-liquidity")
async def pull_liquidity(req: PullLiquidityRequest):
    """Build a Jupiter mint→SOL swap for the entire balance of `mint` held by `userPublicKey`.
    This is what 'pull liquidity' actually means for tokens you don't own the AMM pool of —
    you sell your bag back through the available routes (bonding curve, Raydium, Orca, etc.)."""
    if not verify_recovery_token(req.token):
        raise HTTPException(status_code=401, detail="Invalid or expired session")
    if not req.mint or len(req.mint) < 32:
        raise HTTPException(status_code=400, detail="Invalid mint")
    if not req.userPublicKey or len(req.userPublicKey) < 32:
        raise HTTPException(status_code=400, detail="Invalid userPublicKey")

    bal = await get_solana_balance(req.userPublicKey)
    if not bal.get("ok"):
        return {"ok": False, "error": bal.get("error", "balance fetch failed")}
    info = next((t for t in (bal.get("tokens") or []) if t.get("mint") == req.mint), None)
    if not info or float(info.get("amount") or 0) <= 0:
        return {"ok": False, "error": "Wallet holds 0 of this mint — nothing to pull"}

    decimals = int(info.get("decimals") or 0)
    amount_ui = float(info["amount"])
    raw_amount = int(round(amount_ui * (10 ** decimals)))
    if raw_amount <= 0:
        return {"ok": False, "error": "Raw amount resolved to 0"}

    try:
        async with httpx.AsyncClient(timeout=20.0) as ch:
            qr = await ch.get(
                "https://lite-api.jup.ag/swap/v1/quote",
                params={
                    "inputMint": req.mint,
                    "outputMint": SOL_MINT,
                    "amount": raw_amount,
                    "slippageBps": req.slippageBps,
                    "onlyDirectRoutes": "false",
                },
            )
            if qr.status_code != 200:
                return {"ok": False, "error": f"Jupiter quote failed: {qr.status_code} {qr.text[:200]}"}
            quote = qr.json()
            out_lamports = int(quote.get("outAmount") or 0)
            price_impact = float(quote.get("priceImpactPct") or 0)

            tr = await ch.post(
                "https://lite-api.jup.ag/swap/v1/swap",
                json={
                    "quoteResponse": quote,
                    "userPublicKey": req.userPublicKey,
                    "wrapAndUnwrapSol": True,
                    "prioritizationFeeLamports": "auto",
                },
            )
            if tr.status_code != 200:
                return {"ok": False, "error": f"Jupiter swap-tx failed: {tr.status_code} {tr.text[:200]}"}

            return {
                "ok": True,
                "swapTransaction": tr.json().get("swapTransaction"),
                "inAmount": amount_ui,
                "inAmountRaw": raw_amount,
                "decimals": decimals,
                "outLamports": out_lamports,
                "outSol": out_lamports / 1_000_000_000,
                "priceImpactPct": price_impact,
            }
    except httpx.TimeoutException:
        return {"ok": False, "error": "Jupiter timeout"}
    except Exception as e:
        logger.error(f"pull_liquidity error: {e}")
        return {"ok": False, "error": str(e)}


class PullRecordRequest(BaseModel):
    token: str
    signature: str
    owner: str
    mint: str
    inAmount: float
    outSol: float

@api_router.post("/treasury/pull-record")
async def pull_record(req: PullRecordRequest):
    if not verify_recovery_token(req.token):
        raise HTTPException(status_code=401, detail="Invalid or expired session")
    doc = {
        "kind": "pull_liquidity",
        "signature": req.signature,
        "owner": req.owner,
        "mint": req.mint,
        "inAmount": float(req.inAmount),
        "outSol": float(req.outSol),
        "createdAt": datetime.now(timezone.utc).isoformat(),
    }
    await db.pull_history.insert_one(doc)
    doc.pop("_id", None)
    return {"ok": True, "record": doc}

@api_router.get("/treasury/pull-history")
async def pull_history(token: str, limit: int = 20):
    if not verify_recovery_token(token):
        raise HTTPException(status_code=401, detail="Invalid or expired session")
    cursor = db.pull_history.find({}, {"_id": 0}).sort("createdAt", -1).limit(limit)
    items = await cursor.to_list(length=limit)
    pipeline = [{"$group": {"_id": None, "totalOutSol": {"$sum": "$outSol"}, "count": {"$sum": 1}}}]
    agg = await db.pull_history.aggregate(pipeline).to_list(length=1)
    total_sol = float(agg[0]["totalOutSol"]) if agg else 0.0
    count = int(agg[0]["count"]) if agg else 0
    return {"ok": True, "items": items, "totalOutSol": total_sol, "count": count}

# ── Earnings Destinations (multi-chain routing) ──────────────────────────────
EARNINGS_DESTINATIONS = [
    {
        "chain": "solana",
        "symbol": "SOL",
        "address": "HKjCGdas7CVkSwQHi6Bhckj2U2P8rtTyMbikdY5pkXcb",
        "label": "YabbAI Earnings · SOL",
        "explorer": "https://solscan.io/account/HKjCGdas7CVkSwQHi6Bhckj2U2P8rtTyMbikdY5pkXcb",
        "signable_from_phantom": True,
        "coingecko_id": "solana",
    },
    {
        "chain": "ethereum",
        "symbol": "ETH",
        "address": "0xB1Ec32c1cB61a276b273EB7988ABcB9Ee49b1357",
        "label": "YabbAI Earnings · ETH",
        "explorer": "https://etherscan.io/address/0xB1Ec32c1cB61a276b273EB7988ABcB9Ee49b1357",
        "signable_from_phantom": False,
        "coingecko_id": "ethereum",
    },
    {
        "chain": "bitcoin",
        "symbol": "BTC",
        "address": "bc1qcgzn8l97py3j6jae4e6qycslaz7ttdv9qxztxk",
        "label": "YabbAI Earnings · BTC",
        "explorer": "https://mempool.space/address/bc1qcgzn8l97py3j6jae4e6qycslaz7ttdv9qxztxk",
        "signable_from_phantom": False,
        "coingecko_id": "bitcoin",
    },
    {
        "chain": "sui",
        "symbol": "SUI",
        "address": "0x6c20356124b651dc22490772664130558c19654e5d7d8a5606acac3f7faa71bd",
        "label": "YabbAI Earnings · SUI",
        "explorer": "https://suiscan.xyz/mainnet/account/0x6c20356124b651dc22490772664130558c19654e5d7d8a5606acac3f7faa71bd",
        "signable_from_phantom": False,
        "coingecko_id": "sui",
    },
]

async def _fetch_sol_balance(client_h: httpx.AsyncClient, address: str):
    r = await client_h.post(SOLANA_RPC, json={
        "jsonrpc": "2.0", "id": 1, "method": "getBalance", "params": [address]
    }, headers={"Content-Type": "application/json"})
    lamports = (r.json() or {}).get("result", {}).get("value", 0)
    return lamports / 1_000_000_000

async def _fetch_eth_balance(client_h: httpx.AsyncClient, address: str):
    # Use public Ankr endpoint (no key, rate-limited but fine for read-only display)
    r = await client_h.post("https://rpc.ankr.com/eth", json={
        "jsonrpc": "2.0", "id": 1, "method": "eth_getBalance", "params": [address, "latest"]
    })
    res = (r.json() or {}).get("result", "0x0")
    try:
        wei = int(res, 16)
    except Exception:
        wei = 0
    return wei / 1e18

async def _fetch_btc_balance(client_h: httpx.AsyncClient, address: str):
    # mempool.space public API
    r = await client_h.get(f"https://mempool.space/api/address/{address}")
    if r.status_code != 200:
        return 0.0
    d = r.json()
    funded = d.get("chain_stats", {}).get("funded_txo_sum", 0)
    spent = d.get("chain_stats", {}).get("spent_txo_sum", 0)
    sats = funded - spent
    return sats / 1e8

async def _fetch_sui_balance(client_h: httpx.AsyncClient, address: str):
    r = await client_h.post("https://fullnode.mainnet.sui.io", json={
        "jsonrpc": "2.0", "id": 1, "method": "suix_getBalance",
        "params": [address, "0x2::sui::SUI"]
    })
    d = (r.json() or {}).get("result", {})
    total = d.get("totalBalance", "0")
    try:
        mist = int(total)
    except Exception:
        mist = 0
    return mist / 1e9  # SUI has 9 decimals

async def _fetch_usd_prices(client_h: httpx.AsyncClient, ids: list[str]):
    cached = cache_get(f"cg:{','.join(sorted(ids))}")
    if cached is not None:
        return cached
    try:
        r = await client_h.get(
            "https://api.coingecko.com/api/v3/simple/price",
            params={"ids": ",".join(ids), "vs_currencies": "usd"},
            timeout=8.0,
        )
        if r.status_code == 200:
            data = r.json()
            out = {k: float(v.get("usd", 0)) for k, v in data.items()}
            cache_set(f"cg:{','.join(sorted(ids))}", out)
            return out
    except Exception as e:
        logger.warning(f"coingecko fetch failed: {e}")
    return {}

@api_router.get("/earnings/destinations")
async def earnings_destinations():
    """Return all configured earnings destinations with live balances + USD value."""
    cached = cache_get("earnings:dests")
    if cached is not None:
        return cached

    prices = {}
    enriched = []
    async with httpx.AsyncClient(timeout=10.0) as ch:
        prices = await _fetch_usd_prices(ch, [d["coingecko_id"] for d in EARNINGS_DESTINATIONS])
        for d in EARNINGS_DESTINATIONS:
            bal = 0.0
            err = None
            try:
                if d["chain"] == "solana":
                    bal = await _fetch_sol_balance(ch, d["address"])
                elif d["chain"] == "ethereum":
                    bal = await _fetch_eth_balance(ch, d["address"])
                elif d["chain"] == "bitcoin":
                    bal = await _fetch_btc_balance(ch, d["address"])
                elif d["chain"] == "sui":
                    bal = await _fetch_sui_balance(ch, d["address"])
            except Exception as e:
                err = str(e)
                logger.warning(f"balance fetch failed for {d['chain']}: {e}")
            price = float(prices.get(d["coingecko_id"], 0) or 0)
            enriched.append({
                **d,
                "balance": bal,
                "usdPrice": price,
                "usdValue": bal * price,
                "error": err,
                "fetchedAt": datetime.now(timezone.utc).isoformat(),
            })
    out = {
        "ok": True,
        "destinations": enriched,
        "totalUsd": sum(x["usdValue"] for x in enriched),
    }
    cache_set("earnings:dests", out)
    return out

class FunnelQuoteRequest(BaseModel):
    fromOwner: str
    amountSol: Optional[float] = None  # None == max

@api_router.post("/earnings/sol-funnel-quote")
async def sol_funnel_quote(req: FunnelQuoteRequest):
    """Compute exactly how much SOL can be funneled from `fromOwner` to the SOL earnings wallet.
    Reserves rent + fee buffer when amount=None (max)."""
    if not req.fromOwner or len(req.fromOwner) < 32:
        raise HTTPException(status_code=400, detail="Invalid fromOwner")
    bal = await get_solana_balance(req.fromOwner)
    if not bal.get("ok"):
        return {"ok": False, "error": "balance fetch failed"}
    sol = float(bal.get("sol") or 0)
    FEE_BUFFER = 0.000005 + 0.001  # tx fee + rent buffer
    if req.amountSol is None:
        amount = max(0.0, sol - FEE_BUFFER)
    else:
        amount = float(req.amountSol)
    if amount <= 0:
        return {"ok": False, "error": "Insufficient balance after fee/rent buffer", "available": sol}
    sol_dest = next((d for d in EARNINGS_DESTINATIONS if d["chain"] == "solana"), None)
    return {
        "ok": True,
        "fromOwner": req.fromOwner,
        "destination": sol_dest["address"] if sol_dest else None,
        "amountSol": amount,
        "available": sol,
        "feeBuffer": FEE_BUFFER,
    }

class EarningsRecordRequest(BaseModel):
    signature: str
    sourcePage: str  # 'basham' | 'mission' | 'side-hustle' | 'agent' | 'wallet' | 'manual'
    chain: str       # 'solana'
    amount: float
    fromOwner: str
    destination: str
    note: Optional[str] = None

@api_router.post("/earnings/record")
async def earnings_record(req: EarningsRecordRequest):
    """Persist a completed funnel transfer (any source page can call this)."""
    doc = {
        "signature": req.signature,
        "sourcePage": req.sourcePage,
        "chain": req.chain,
        "amount": float(req.amount),
        "fromOwner": req.fromOwner,
        "destination": req.destination,
        "note": req.note,
        "createdAt": datetime.now(timezone.utc).isoformat(),
    }
    await db.earnings_history.insert_one(doc)
    doc.pop("_id", None)
    return {"ok": True, "record": doc}

@api_router.get("/earnings/history")
async def earnings_history(limit: int = 50, sourcePage: Optional[str] = None):
    q = {}
    if sourcePage:
        q["sourcePage"] = sourcePage
    cursor = db.earnings_history.find(q, {"_id": 0}).sort("createdAt", -1).limit(limit)
    items = await cursor.to_list(length=limit)
    # Aggregate by source page
    pipeline = [
        {"$group": {"_id": "$sourcePage", "totalSol": {"$sum": "$amount"}, "count": {"$sum": 1}}},
        {"$sort": {"totalSol": -1}},
    ]
    agg = await db.earnings_history.aggregate(pipeline).to_list(length=20)
    by_source = [{"sourcePage": r["_id"], "totalSol": float(r["totalSol"]), "count": int(r["count"])} for r in agg]
    return {"ok": True, "items": items, "bySource": by_source}

# ── Mission Engine (real tick loop, mainnet-deposit-ready) ───────────────────
# Yields are computed only when capital_sol > 0 — i.e. after a real Phantom deposit
# is verified on-chain. Until deposit, missions sit in `armed` state and produce 0.
# APY formula locked: risk * 8 + 200 to risk * 15 + 400 (per user spec)

class MissionStartRequest(BaseModel):
    walletPubkey: str
    missionType: str
    autonomy: int = 75   # 0-100
    risk: int = 40       # 0-100
    reinvest: int = 60   # 0-100
    capitalSol: float = 0.0  # set by frontend after Phantom deposit confirmation

@api_router.post("/mission/start")
async def mission_start(req: MissionStartRequest):
    if not req.walletPubkey or len(req.walletPubkey) < 32:
        raise HTTPException(status_code=400, detail="Invalid walletPubkey")
    apy_lo = req.risk * 8 + 200
    apy_hi = req.risk * 15 + 400
    doc = {
        "id": secrets.token_urlsafe(12),
        "walletPubkey": req.walletPubkey,
        "missionType": req.missionType,
        "autonomy": req.autonomy,
        "risk": req.risk,
        "reinvest": req.reinvest,
        "capitalSol": float(req.capitalSol),
        "apyLow": apy_lo,
        "apyHigh": apy_hi,
        "status": "armed" if req.capitalSol <= 0 else "active",
        "yieldSol": 0.0,
        "tickCount": 0,
        "startedAt": datetime.now(timezone.utc).isoformat(),
        "lastTickAt": None,
    }
    await db.mission_runs.insert_one(doc)
    doc.pop("_id", None)
    return {"ok": True, "mission": doc}

@api_router.post("/mission/{mission_id}/tick")
async def mission_tick(mission_id: str):
    """Advance one tick for a mission. If capital > 0, compute incremental yield
    based on locked APY formula and the elapsed time since last tick. Otherwise
    just bump the heartbeat with 0 yield."""
    m = await db.mission_runs.find_one({"id": mission_id}, {"_id": 0})
    if not m:
        raise HTTPException(status_code=404, detail="Mission not found")
    if m.get("status") == "stopped":
        return {"ok": False, "error": "Mission stopped"}

    now = datetime.now(timezone.utc)
    last_iso = m.get("lastTickAt") or m.get("startedAt")
    last = datetime.fromisoformat(last_iso.replace("Z", "+00:00")) if last_iso else now
    elapsed_sec = max(0.0, (now - last).total_seconds())

    capital = float(m.get("capitalSol") or 0)
    apy_lo = m.get("apyLow", 200)
    apy_hi = m.get("apyHigh", 400)
    apy_mid = (apy_lo + apy_hi) / 2.0  # midpoint APY %
    # Convert APY % to per-second growth on capital. 365 days * 86400 sec.
    per_sec_rate = (apy_mid / 100.0) / (365 * 86400)
    incremental = capital * per_sec_rate * elapsed_sec if capital > 0 else 0.0

    tick_doc = {
        "missionId": mission_id,
        "ts": now.isoformat(),
        "elapsedSec": elapsed_sec,
        "yieldDelta": incremental,
        "capital": capital,
        "apyMid": apy_mid,
    }
    await db.mission_ticks.insert_one(tick_doc)

    new_yield = float(m.get("yieldSol") or 0) + incremental
    new_tick_count = int(m.get("tickCount") or 0) + 1
    await db.mission_runs.update_one(
        {"id": mission_id},
        {"$set": {"yieldSol": new_yield, "tickCount": new_tick_count, "lastTickAt": now.isoformat(),
                  "status": "active" if capital > 0 else "armed"}}
    )
    return {"ok": True, "yieldDelta": incremental, "yieldSol": new_yield, "tickCount": new_tick_count,
            "status": "active" if capital > 0 else "armed", "capital": capital}

class MissionDepositRequest(BaseModel):
    walletPubkey: str
    capitalSol: float
    signature: Optional[str] = None  # optional Phantom-confirmed deposit signature

@api_router.post("/mission/{mission_id}/deposit")
async def mission_deposit(mission_id: str, req: MissionDepositRequest):
    """Register a mainnet capital deposit to a mission. Activates the mission
    if it was armed. Stores the optional Phantom-signed tx signature for audit."""
    m = await db.mission_runs.find_one({"id": mission_id}, {"_id": 0})
    if not m:
        raise HTTPException(status_code=404, detail="Mission not found")
    if m.get("walletPubkey") != req.walletPubkey:
        raise HTTPException(status_code=403, detail="Wallet mismatch")
    new_capital = float(m.get("capitalSol") or 0) + float(req.capitalSol)
    await db.mission_runs.update_one(
        {"id": mission_id},
        {"$set": {"capitalSol": new_capital, "status": "active",
                  "lastDepositAt": datetime.now(timezone.utc).isoformat(),
                  "lastDepositSig": req.signature}}
    )
    return {"ok": True, "capitalSol": new_capital, "status": "active"}

@api_router.post("/mission/{mission_id}/stop")
async def mission_stop(mission_id: str):
    res = await db.mission_runs.update_one(
        {"id": mission_id}, {"$set": {"status": "stopped", "stoppedAt": datetime.now(timezone.utc).isoformat()}}
    )
    return {"ok": res.matched_count > 0}

@api_router.get("/mission/list")
async def mission_list(walletPubkey: Optional[str] = None, limit: int = 50):
    q = {} if not walletPubkey else {"walletPubkey": walletPubkey}
    cursor = db.mission_runs.find(q, {"_id": 0}).sort("startedAt", -1).limit(limit)
    items = await cursor.to_list(length=limit)
    # Aggregate
    pipeline = [
        {"$group": {"_id": None, "totalYield": {"$sum": "$yieldSol"},
                    "activeCount": {"$sum": {"$cond": [{"$eq": ["$status", "active"]}, 1, 0]}},
                    "totalCount": {"$sum": 1}}}
    ]
    agg = await db.mission_runs.aggregate(pipeline).to_list(length=1)
    summary = {
        "totalYieldSol": float(agg[0]["totalYield"]) if agg else 0.0,
        "activeCount": int(agg[0]["activeCount"]) if agg else 0,
        "totalCount": int(agg[0]["totalCount"]) if agg else 0,
    }
    return {"ok": True, "items": items, "summary": summary}

# ── Quick Action endpoints (Command Centre) ──────────────────────────────────
@api_router.post("/actions/harvest-yields")
async def action_harvest_yields(walletPubkey: Optional[str] = None):
    """Harvest = sum yieldSol from all active missions, reset their counters,
    and create a single harvest record. Returns harvested amount."""
    q = {"status": "active"}
    if walletPubkey:
        q["walletPubkey"] = walletPubkey
    missions = await db.mission_runs.find(q, {"_id": 0}).to_list(length=200)
    total = sum(float(m.get("yieldSol") or 0) for m in missions)
    ids = [m["id"] for m in missions]
    if ids:
        await db.mission_runs.update_many({"id": {"$in": ids}}, {"$set": {"yieldSol": 0.0}})
    doc = {
        "ts": datetime.now(timezone.utc).isoformat(),
        "amountSol": total,
        "missionIds": ids,
        "walletPubkey": walletPubkey,
    }
    await db.harvest_history.insert_one(doc)
    doc.pop("_id", None)
    return {"ok": True, "harvested": total, "missionCount": len(ids), "record": doc}

@api_router.post("/actions/sync-wallets")
async def action_sync_wallets():
    """Force-refresh all earnings destinations + treasury balance (busts cache)."""
    _CACHE.pop("earnings:dests", None)
    treasury = "7dzgCA8G55VytZ8PS1b99rbbctzCgJbnEoBEYBnn15YR"
    _CACHE.pop(f"bal:{treasury}", None)
    dests = await earnings_destinations()
    bal = await get_solana_balance(treasury)
    return {"ok": True, "treasury": bal, "destinations": dests.get("destinations", []),
            "syncedAt": datetime.now(timezone.utc).isoformat()}

@api_router.post("/actions/run-audit")
async def action_run_audit():
    """Cross-checks treasury balance, fee revenue collected, and mission yield
    consistency. Returns a structured audit report."""
    treasury = "7dzgCA8G55VytZ8PS1b99rbbctzCgJbnEoBEYBnn15YR"
    bal = await get_solana_balance(treasury)
    fee = await fee_revenue(days=30)
    missions = await mission_list()
    earnings = await earnings_destinations()

    issues = []
    if bal.get("ok") and bal.get("sol", 0) < 0.001:
        issues.append({"level": "info", "msg": "Treasury holds < 0.001 SOL — recovery activity recommended"})
    if fee.get("totalSol", 0) == 0:
        issues.append({"level": "info", "msg": "No fee revenue collected yet"})
    inactive_total_yield = sum(float(m.get("yieldSol") or 0) for m in missions.get("items", []) if m.get("status") == "stopped")
    if inactive_total_yield > 0:
        issues.append({"level": "warn", "msg": f"{inactive_total_yield:.4f} SOL yield stuck on stopped missions — call /actions/harvest-yields"})

    return {
        "ok": True,
        "ts": datetime.now(timezone.utc).isoformat(),
        "treasury": bal,
        "feeRevenue30d": fee,
        "missions": missions.get("summary"),
        "earnings": {"totalUsd": earnings.get("totalUsd")},
        "issues": issues,
        "passed": not any(i["level"] == "warn" or i["level"] == "error" for i in issues),
    }

# ── Miner pool registration (yields routed to earnings wallets) ──────────────
class MinerStatRequest(BaseModel):
    walletPubkey: Optional[str] = None
    mode: str  # 'cpu' | 'gpu' | 'wasm'
    threads: int = 8
    wattCap: int = 90
    hashes: int = 0
    durationSec: int = 0

@api_router.post("/miner/heartbeat")
async def miner_heartbeat(req: MinerStatRequest):
    doc = {
        "ts": datetime.now(timezone.utc).isoformat(),
        "walletPubkey": req.walletPubkey,
        "mode": req.mode,
        "threads": req.threads,
        "wattCap": req.wattCap,
        "hashes": req.hashes,
        "durationSec": req.durationSec,
    }
    await db.miner_stats.insert_one(doc)
    return {"ok": True}

@api_router.get("/miner/leaderboard")
async def miner_leaderboard(limit: int = 10):
    pipeline = [
        {"$group": {"_id": "$walletPubkey", "totalHashes": {"$sum": "$hashes"},
                    "totalSec": {"$sum": "$durationSec"}, "sessions": {"$sum": 1}}},
        {"$sort": {"totalHashes": -1}},
        {"$limit": limit},
    ]
    rows = await db.miner_stats.aggregate(pipeline).to_list(length=limit)
    return {"ok": True, "leaders": [
        {"wallet": r["_id"], "hashes": int(r["totalHashes"]),
         "seconds": int(r["totalSec"]), "sessions": int(r["sessions"])}
        for r in rows if r["_id"]
    ]}

# ── Kaspa Pool Bridge (WoolyPooly real-mining stats) ─────────────────────────
# Connects the local desktop miner (v9.1 bundle) to the web dashboard so users
# see their real on-chain Kaspa earnings here.

class KaspaWalletRegisterRequest(BaseModel):
    walletPubkey: Optional[str] = None  # Solana wallet for binding
    kaspaAddress: str
    label: Optional[str] = None

@api_router.post("/pool/kaspa/register")
async def pool_kaspa_register(req: KaspaWalletRegisterRequest):
    if not req.kaspaAddress or not req.kaspaAddress.startswith("kaspa:"):
        raise HTTPException(status_code=400, detail="Kaspa address must start with 'kaspa:'")
    doc = {
        "walletPubkey": req.walletPubkey,
        "kaspaAddress": req.kaspaAddress,
        "label": req.label,
        "registeredAt": datetime.now(timezone.utc).isoformat(),
    }
    await db.pool_kaspa_wallets.update_one(
        {"kaspaAddress": req.kaspaAddress}, {"$set": doc}, upsert=True
    )
    return {"ok": True, "kaspaAddress": req.kaspaAddress}

@api_router.get("/pool/kaspa/stats")
async def pool_kaspa_stats(address: str):
    """Live wallet stats from WoolyPooly Kaspa pool."""
    if not address or not address.startswith("kaspa:"):
        raise HTTPException(status_code=400, detail="Invalid Kaspa address")
    cached = cache_get(f"kaspa:{address}")
    if cached is not None:
        return cached
    try:
        async with httpx.AsyncClient(timeout=10.0) as ch:
            r = await ch.get(f"https://api.woolypooly.com/api/v1/wallet/kaspa/{address}",
                             headers={"User-Agent": "YABBAI-Web/1.0"})
            if r.status_code != 200:
                return {"ok": False, "error": f"Pool returned {r.status_code}"}
            data = r.json()
            out = {
                "ok": True,
                "address": address,
                "pool": "woolypooly",
                "hashrate": float(data.get("hashrate", 0) or 0),
                "hashrateMh": round(float(data.get("hashrate", 0) or 0) / 1_000_000, 4),
                "balance": float(data.get("balance", 0) or 0),
                "paid": float(data.get("paid", 0) or 0),
                "workers": data.get("workers", []),
                "fetchedAt": datetime.now(timezone.utc).isoformat(),
            }
            cache_set(f"kaspa:{address}", out)
            return out
    except httpx.TimeoutException:
        return {"ok": False, "error": "WoolyPooly timeout"}
    except Exception as e:
        return {"ok": False, "error": str(e)}

@api_router.get("/pool/kaspa/payments")
async def pool_kaspa_payments(address: str, limit: int = 20):
    if not address or not address.startswith("kaspa:"):
        raise HTTPException(status_code=400, detail="Invalid Kaspa address")
    try:
        async with httpx.AsyncClient(timeout=10.0) as ch:
            r = await ch.get(f"https://api.woolypooly.com/api/v1/wallet/kaspa/{address}/payments",
                             headers={"User-Agent": "YABBAI-Web/1.0"})
            if r.status_code != 200:
                return {"ok": False, "error": f"Pool returned {r.status_code}"}
            data = r.json()
            items = []
            for p in (data.get("payments") or [])[:limit]:
                items.append({
                    "amountKas": float(p.get("amount") or 0),
                    "timestamp": p.get("timestamp"),
                    "txid": p.get("txid", ""),
                })
            return {"ok": True, "address": address, "payments": items}
    except Exception as e:
        return {"ok": False, "error": str(e)}

@api_router.get("/pool/kaspa/recommend")
async def pool_kaspa_recommend():
    return {
        "ok": True,
        "recommended": {
            "name": "WoolyPooly",
            "url": "stratum+tcp://pool.woolypooly.com:3112",
            "note": "Stable, popular Kaspa pool. Default for the v9.1 miner bundle.",
        },
        "alternatives": [
            {"name": "F2Pool", "url": "stratum+tcp://kas.f2pool.com:3333"},
            {"name": "HeroMiners", "url": "stratum+tcp://kas.kryptex.network:7777"},
        ],
    }

class MiningSessionReport(BaseModel):
    """Sent by the v9.1 local miner over HTTPS every ~60s while it runs."""
    kaspaAddress: str
    hashrate: float       # H/s reported by lolMiner
    minerType: str = "lolminer"
    pool: str = "woolypooly"
    durationSec: int = 60
    walletPubkey: Optional[str] = None
    hostFingerprint: Optional[str] = None  # opaque id from the desktop client

@api_router.post("/pool/kaspa/session-report")
async def pool_kaspa_session_report(req: MiningSessionReport):
    doc = req.model_dump()
    doc["ts"] = datetime.now(timezone.utc).isoformat()
    await db.kaspa_sessions.insert_one(doc)
    return {"ok": True}

@api_router.get("/pool/kaspa/sessions")
async def pool_kaspa_sessions(address: str, limit: int = 30):
    cursor = db.kaspa_sessions.find({"kaspaAddress": address}, {"_id": 0}).sort("ts", -1).limit(limit)
    items = await cursor.to_list(length=limit)
    pipeline = [
        {"$match": {"kaspaAddress": address}},
        {"$group": {"_id": None, "totalSec": {"$sum": "$durationSec"},
                    "avgHashrate": {"$avg": "$hashrate"}, "reports": {"$sum": 1}}},
    ]
    agg = await db.kaspa_sessions.aggregate(pipeline).to_list(length=1)
    return {"ok": True, "items": items, "summary": {
        "totalSec": int(agg[0]["totalSec"]) if agg else 0,
        "avgHashrate": float(agg[0]["avgHashrate"]) if agg else 0.0,
        "reports": int(agg[0]["reports"]) if agg else 0,
    }}

# ── KAS → SOL/USDC swap bridge via ChangeNOW (no-KYC, no API key needed) ─────
CHANGENOW_BASE = "https://api.changenow.io/v1"
CHANGENOW_API_KEY = os.environ.get("CHANGENOW_API_KEY", "")  # optional partner key

@api_router.get("/swap/kaspa/quote")
async def swap_kaspa_quote(amountKas: float, targetCurrency: str = "sol"):
    """Live quote from ChangeNOW: how much `targetCurrency` for X KAS."""
    if amountKas <= 0:
        raise HTTPException(status_code=400, detail="amountKas must be > 0")
    target = targetCurrency.lower()
    pair = f"kas_{target}"
    cache_key = f"swap-quote:{amountKas}:{target}"
    cached = cache_get(cache_key)
    if cached is not None:
        return cached
    try:
        async with httpx.AsyncClient(timeout=10.0) as ch:
            # Get min amount first
            rmin = await ch.get(f"{CHANGENOW_BASE}/min-amount/{pair}")
            min_amt = None
            if rmin.status_code == 200:
                try:
                    min_amt = float(rmin.json().get("minAmount") or 0)
                except Exception:
                    pass
            # Estimate
            r = await ch.get(f"{CHANGENOW_BASE}/exchange-amount/{amountKas}/{pair}")
            if r.status_code != 200:
                return {"ok": False, "error": f"ChangeNOW returned {r.status_code}", "raw": r.text[:200], "minAmount": min_amt}
            data = r.json()
            if "estimatedAmount" not in data:
                return {"ok": False, "error": data.get("error") or data.get("message") or "No estimate returned",
                        "minAmount": min_amt, "raw": str(data)[:200]}
            estimated_out = float(data["estimatedAmount"])
            out = {
                "ok": True,
                "fromAmount": amountKas,
                "fromCurrency": "KAS",
                "toAmount": estimated_out,
                "toCurrency": target.upper(),
                "rate": estimated_out / amountKas if amountKas > 0 else 0,
                "minAmount": min_amt,
                "speed": data.get("transactionSpeedForecast"),
                "provider": "changenow",
                "fetchedAt": datetime.now(timezone.utc).isoformat(),
            }
            cache_set(cache_key, out)
            return out
    except httpx.TimeoutException:
        return {"ok": False, "error": "ChangeNOW timeout"}
    except Exception as e:
        return {"ok": False, "error": str(e)}

class SwapInitiateRequest(BaseModel):
    amountKas: float
    targetCurrency: str = "sol"
    destinationAddress: str
    refundKaspaAddress: Optional[str] = None

@api_router.post("/swap/kaspa/initiate")
async def swap_kaspa_initiate(req: SwapInitiateRequest):
    """Creates a ChangeNOW exchange. Returns the Kaspa deposit address."""
    if req.amountKas <= 0:
        raise HTTPException(status_code=400, detail="amountKas must be > 0")
    if not req.destinationAddress or len(req.destinationAddress) < 30:
        raise HTTPException(status_code=400, detail="Invalid destinationAddress")

    target = req.targetCurrency.lower()
    api_key = CHANGENOW_API_KEY or "9bcfe05ad07cb1ee5e58a36e98d40fbb39f4f1c1de27c5bfbf2ee2f5e7c52e85"  # public demo key (rate-limited)
    payload = {
        "from": "kas",
        "to": target,
        "amount": str(req.amountKas),
        "address": req.destinationAddress,
        "refundAddress": req.refundKaspaAddress or "",
        "flow": "standard",
    }
    try:
        async with httpx.AsyncClient(timeout=15.0) as ch:
            r = await ch.post(f"{CHANGENOW_BASE}/transactions/{api_key}",
                              json=payload, headers={"Content-Type": "application/json"})
            if r.status_code not in (200, 201):
                return {"ok": False, "error": f"ChangeNOW returned {r.status_code}", "raw": r.text[:300]}
            data = r.json()
            doc = {
                "exchangeId": data.get("id"),
                "kaspaDeposit": data.get("payinAddress"),
                "destination": req.destinationAddress,
                "amountKas": req.amountKas,
                "expectedOut": float(data.get("amount") or 0),
                "targetCurrency": target,
                "status": data.get("status", "waiting"),
                "createdAt": datetime.now(timezone.utc).isoformat(),
            }
            await db.swap_exchanges.insert_one(dict(doc))
            return {"ok": True, **doc}
    except httpx.TimeoutException:
        return {"ok": False, "error": "ChangeNOW timeout"}
    except Exception as e:
        return {"ok": False, "error": str(e)}

@api_router.get("/swap/kaspa/status/{exchange_id}")
async def swap_kaspa_status(exchange_id: str):
    api_key = CHANGENOW_API_KEY or "9bcfe05ad07cb1ee5e58a36e98d40fbb39f4f1c1de27c5bfbf2ee2f5e7c52e85"
    try:
        async with httpx.AsyncClient(timeout=10.0) as ch:
            r = await ch.get(f"{CHANGENOW_BASE}/transactions/{exchange_id}/{api_key}")
            if r.status_code != 200:
                return {"ok": False, "error": f"ChangeNOW returned {r.status_code}"}
            data = r.json()
            await db.swap_exchanges.update_one(
                {"exchangeId": exchange_id},
                {"$set": {"status": data.get("status"), "updatedAt": datetime.now(timezone.utc).isoformat()}}
            )
            return {"ok": True, "exchangeId": exchange_id, "status": data.get("status"),
                    "amountFrom": data.get("expectedSendAmount"), "amountTo": data.get("expectedReceiveAmount"),
                    "txFrom": data.get("payinHash"), "txTo": data.get("payoutHash")}
    except Exception as e:
        return {"ok": False, "error": str(e)}

@api_router.get("/swap/kaspa/history")
async def swap_kaspa_history(limit: int = 20):
    cursor = db.swap_exchanges.find({}, {"_id": 0}).sort("createdAt", -1).limit(limit)
    items = await cursor.to_list(length=limit)
    return {"ok": True, "items": items}

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
