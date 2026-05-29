"""Backend tests for Mission engine, Quick Actions, and Miner endpoints."""
import os
import time
import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
# Fallback to frontend/.env if not in shell env
if not BASE_URL:
    try:
        with open('/app/frontend/.env') as f:
            for line in f:
                if line.startswith('REACT_APP_BACKEND_URL='):
                    BASE_URL = line.split('=', 1)[1].strip().strip('"').rstrip('/')
                    break
    except Exception:
        pass

TEST_WALLET = "HKjCGdas7CVkSwQHi6Bhckj2U2P8rtTyMbikdY5pkXcb"


@pytest.fixture(scope="module")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def armed_mission(api):
    r = api.post(f"{BASE_URL}/api/mission/start", json={
        "walletPubkey": TEST_WALLET,
        "missionType": "TEST_yield_farming",
        "autonomy": 80, "risk": 50, "reinvest": 60,
        "capitalSol": 0.0
    }, timeout=15)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["ok"] is True
    m = data["mission"]
    assert m["status"] == "armed"
    assert m["capitalSol"] == 0.0
    # Verify APY formula: risk*8+200 to risk*15+400
    assert m["apyLow"] == 50 * 8 + 200
    assert m["apyHigh"] == 50 * 15 + 400
    return m


class TestMissionEngine:
    def test_start_armed_with_zero_capital(self, armed_mission):
        assert armed_mission["status"] == "armed"
        assert "id" in armed_mission

    def test_tick_armed_zero_yield(self, api, armed_mission):
        time.sleep(1)
        r = api.post(f"{BASE_URL}/api/mission/{armed_mission['id']}/tick", timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["ok"] is True
        assert data["yieldDelta"] == 0.0
        assert data["status"] == "armed"

    def test_deposit_activates_mission(self, api, armed_mission):
        r = api.post(f"{BASE_URL}/api/mission/{armed_mission['id']}/deposit", json={
            "walletPubkey": TEST_WALLET,
            "capitalSol": 1.0,
            "signature": "TEST_SIGNATURE_xxx"
        }, timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["ok"] is True
        assert data["status"] == "active"
        assert data["capitalSol"] == 1.0

    def test_tick_active_produces_yield(self, api, armed_mission):
        time.sleep(2)
        r = api.post(f"{BASE_URL}/api/mission/{armed_mission['id']}/tick", timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["ok"] is True
        # With capital=1 SOL and apy_mid ~= ((400+200)+(750+400))/2 = ... let's just check >0
        assert data["yieldDelta"] > 0
        assert data["status"] == "active"
        assert data["capital"] == 1.0

    def test_deposit_wrong_wallet_403(self, api, armed_mission):
        r = api.post(f"{BASE_URL}/api/mission/{armed_mission['id']}/deposit", json={
            "walletPubkey": "WRONG_WALLET_xxxxxxxxxxxxxxxxxxxxxx",
            "capitalSol": 1.0,
        }, timeout=10)
        assert r.status_code == 403

    def test_stop_mission(self, api, armed_mission):
        r = api.post(f"{BASE_URL}/api/mission/{armed_mission['id']}/stop", timeout=10)
        assert r.status_code == 200
        assert r.json()["ok"] is True

    def test_tick_after_stop_returns_not_ok(self, api, armed_mission):
        r = api.post(f"{BASE_URL}/api/mission/{armed_mission['id']}/tick", timeout=10)
        assert r.status_code == 200
        assert r.json()["ok"] is False

    def test_start_invalid_wallet_400(self, api):
        r = api.post(f"{BASE_URL}/api/mission/start", json={
            "walletPubkey": "short",
            "missionType": "TEST_x",
        }, timeout=10)
        assert r.status_code == 400

    def test_mission_list_summary(self, api):
        r = api.get(f"{BASE_URL}/api/mission/list", timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert data["ok"] is True
        s = data["summary"]
        assert "totalYieldSol" in s
        assert "activeCount" in s
        assert "totalCount" in s
        assert s["totalCount"] >= 1


class TestQuickActions:
    def test_harvest_yields(self, api):
        # Create + activate a fresh mission so there's yield to harvest
        r = api.post(f"{BASE_URL}/api/mission/start", json={
            "walletPubkey": TEST_WALLET, "missionType": "TEST_harvest",
            "risk": 50, "capitalSol": 5.0
        }, timeout=15)
        mid = r.json()["mission"]["id"]
        time.sleep(2)
        api.post(f"{BASE_URL}/api/mission/{mid}/tick", timeout=15)
        r = api.post(f"{BASE_URL}/api/actions/harvest-yields", timeout=20)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["ok"] is True
        assert "harvested" in data
        assert "missionCount" in data
        # cleanup
        api.post(f"{BASE_URL}/api/mission/{mid}/stop", timeout=10)

    def test_sync_wallets(self, api):
        r = api.post(f"{BASE_URL}/api/actions/sync-wallets", timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["ok"] is True
        assert "destinations" in data
        assert "treasury" in data
        # Verify the 4 chains are present
        chains = [d["chain"] for d in data["destinations"]]
        assert set(chains) >= {"solana", "ethereum", "bitcoin", "sui"}
        # Verify exact addresses
        addr_map = {d["chain"]: d["address"] for d in data["destinations"]}
        assert addr_map["solana"] == "HKjCGdas7CVkSwQHi6Bhckj2U2P8rtTyMbikdY5pkXcb"
        assert addr_map["ethereum"] == "0xB1Ec32c1cB61a276b273EB7988ABcB9Ee49b1357"
        assert addr_map["bitcoin"] == "bc1qcgzn8l97py3j6jae4e6qycslaz7ttdv9qxztxk"
        assert addr_map["sui"].startswith("0x6c20356124b651dc22490772664130558c19654e")

    def test_run_audit(self, api):
        r = api.post(f"{BASE_URL}/api/actions/run-audit", timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["ok"] is True
        assert "issues" in data
        assert isinstance(data["issues"], list)
        assert "treasury" in data
        assert "earnings" in data
        assert "missions" in data


class TestMiner:
    def test_heartbeat_persists(self, api):
        r = api.post(f"{BASE_URL}/api/miner/heartbeat", json={
            "walletPubkey": TEST_WALLET,
            "mode": "cpu", "threads": 16, "wattCap": 90,
            "hashes": 12345, "durationSec": 60
        }, timeout=10)
        assert r.status_code == 200, r.text
        assert r.json()["ok"] is True

    def test_leaderboard_aggregates(self, api):
        # send a second heartbeat to aggregate
        api.post(f"{BASE_URL}/api/miner/heartbeat", json={
            "walletPubkey": TEST_WALLET, "mode": "cpu",
            "threads": 16, "wattCap": 90, "hashes": 5000, "durationSec": 30
        }, timeout=10)
        r = api.get(f"{BASE_URL}/api/miner/leaderboard", timeout=10)
        assert r.status_code == 200
        data = r.json()
        assert data["ok"] is True
        assert isinstance(data["leaders"], list)
        match = next((l for l in data["leaders"] if l["wallet"] == TEST_WALLET), None)
        assert match is not None
        assert match["hashes"] >= 17000


class TestEarningsDestinations:
    def test_destinations_endpoint(self, api):
        r = api.get(f"{BASE_URL}/api/earnings/destinations", timeout=30)
        assert r.status_code == 200
        data = r.json()
        assert data["ok"] is True
        assert len(data["destinations"]) == 4
