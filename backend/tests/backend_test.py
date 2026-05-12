"""Backend API tests for YabbAI-Brain."""
import os
import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://yabbai-mainnet-live.preview.emergentagent.com').rstrip('/')
SOL_MINT = "So11111111111111111111111111111111111111112"
USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
TREASURY = "7dzgCA8G55VytZ8PS1b99rbbctzCgJbnEoBEYBnn15YR"


@pytest.fixture(scope="module")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


def test_health(api):
    r = api.get(f"{BASE_URL}/api/health", timeout=10)
    assert r.status_code == 200
    d = r.json()
    assert d.get("status") == "healthy"


def test_token_mint_lifecycle(api):
    # Delete to start clean
    api.delete(f"{BASE_URL}/api/token-mint", timeout=10)
    # GET empty
    r = api.get(f"{BASE_URL}/api/token-mint", timeout=10)
    assert r.status_code == 200
    assert r.json().get("configured") is False
    # POST
    r = api.post(f"{BASE_URL}/api/token-mint", json={"mint": USDC_MINT}, timeout=10)
    assert r.status_code == 200
    d = r.json()
    assert d["configured"] is True and d["mint"] == USDC_MINT
    # GET persisted
    r = api.get(f"{BASE_URL}/api/token-mint", timeout=10)
    assert r.json()["mint"] == USDC_MINT
    # DELETE
    r = api.delete(f"{BASE_URL}/api/token-mint", timeout=10)
    assert r.status_code == 200 and r.json().get("ok") is True
    r = api.get(f"{BASE_URL}/api/token-mint", timeout=10)
    assert r.json().get("configured") is False


def test_jupiter_price(api):
    r = api.get(f"{BASE_URL}/api/jupiter-price", params={"mint": SOL_MINT}, timeout=15)
    assert r.status_code == 200
    d = r.json()
    assert d.get("ok") is True
    # SOL should have a real price
    assert d.get("price") is not None and float(d["price"]) > 0


def test_solana_balance(api):
    r = api.get(f"{BASE_URL}/api/solana-balance", params={"owner": TREASURY}, timeout=20)
    assert r.status_code == 200
    d = r.json()
    assert d.get("ok") is True
    assert "sol" in d and "tokens" in d
    assert isinstance(d["tokens"], list)


def test_token_live_stats(api):
    r = api.get(f"{BASE_URL}/api/token-live-stats", params={"mint": SOL_MINT}, timeout=20)
    assert r.status_code == 200
    d = r.json()
    assert d.get("ok") is True
    assert "price" in d and "liquidity" in d


def test_swap_quote(api):
    r = api.post(f"{BASE_URL}/api/swap-quote", json={
        "inputMint": SOL_MINT,
        "outputMint": USDC_MINT,
        "amount": 0.01,
        "slippageBps": 50
    }, timeout=20)
    assert r.status_code == 200
    d = r.json()
    assert d.get("ok") is True
    assert "quote" in d


def test_generate_mission(api):
    r = api.post(f"{BASE_URL}/api/generate-mission", json={
        "missionType": "Yield Farm",
        "autonomy": 70,
        "risk": 40,
        "reinvest": 50,
        "selfImprove": True,
        "lockedValues": ["safety", "growth"]
    }, timeout=30)
    assert r.status_code == 200
    d = r.json()
    assert d.get("ok") is True
    assert "plan" in d and len(d["plan"]) > 0


def test_invalid_mint_graceful(api):
    r = api.get(f"{BASE_URL}/api/jupiter-price", params={"mint": "xx"}, timeout=10)
    assert r.status_code == 200
    assert r.json().get("ok") is False


def test_invalid_owner_graceful(api):
    r = api.get(f"{BASE_URL}/api/solana-balance", params={"owner": "xx"}, timeout=10)
    assert r.status_code == 200
    assert r.json().get("ok") is False


def test_invalid_mint_post(api):
    r = api.post(f"{BASE_URL}/api/token-mint", json={"mint": "invalid"}, timeout=10)
    assert r.status_code == 400
