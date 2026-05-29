# YabbAI-Brain — Product Requirements Doc

## Original Problem
Build complete YabbAI-Brain production app from "profitr-main (2).zip":
- 11 pages (Command Centre, Yabbai Token, Launch, Wallet, Withdraw, Mission, Payment, API Pulse, Basham, Side Hustle, Promo)
- Real Solana mainnet integrations (Jupiter price, balance, swap)
- Treasury Recovery page at /treasury-recovery (real balance + Phantom funnel-out)
- Phantom wallet support, dark neon theme (#060E20), glassmorphism
- Static frontend serving, MongoDB, /api prefixed endpoints, /api/health 200

## Architecture
- **Backend**: FastAPI @ 0.0.0.0:8001 (supervisor), `/api/*` routes, MongoDB via MONGO_URL
- **Frontend**: React + CRACO via `yarn start` on port 3000 (supervisor)
- **External APIs**: Jupiter v3 (lite-api.jup.ag), Solana mainnet RPC, Phantom (window.solana)

## Implemented (2026-02-13 — second batch)
### Mission Engine + Quick Actions + Miner + PWA + Android TWA
- `POST /api/mission/start` — armed-state mission, capitalSol=0 starts armed (no fake yield)
- `POST /api/mission/{id}/tick` — only produces yield when capital > 0; APY formula locked `risk*8+200` to `risk*15+400`
- `POST /api/mission/{id}/deposit` — activates mission after real Phantom-signed SOL deposit (mainnet-ready)
- `POST /api/mission/{id}/stop`, `GET /api/mission/list` — lifecycle + summary
- `POST /api/actions/harvest-yields`, `/api/actions/sync-wallets`, `/api/actions/run-audit` — real Quick Actions
- `POST /api/miner/heartbeat`, `GET /api/miner/leaderboard` — public mining stats
- Frontend `/miner` page — WASM CPU miner (8–32 threads slider, 60–130W throttle, real Web Workers + crypto.subtle.SHA-256). Experimental WebGL2 GPU toggle. Phantom-bound earnings. Leaderboard.
- Frontend `/download` page — PWA install button (beforeinstallprompt), Android TWA build instructions, Tauri desktop wrapper recipe
- PWA: `/manifest.json` + `/service-worker.js` registered; site installable on Android home screen
- Android TWA skeleton in `/app/android/` (twa-manifest.json, assetlinks.json, README, .gitignore)
- Deploy Mission button on `/mission` is now real (creates armed mission, auto-ticks every 10s)
- Command Centre Quick Actions wired (Harvest / Sync / Audit / Deploy / Open Miner / Download)

## Implemented (2026-02-13)
### Buy-and-Burn + Dust Sweep (P0 deferred from previous session — now DONE)
- `POST /api/treasury/buy-and-burn` — Jupiter SOL→YABB swap tx + incinerator route
- `POST /api/treasury/burn-record`, `GET /api/treasury/burn-history` — persists/lists burns (MongoDB `burn_history`)
- `POST /api/treasury/dust-scan` — scans SPL wallet for tokens < USD threshold via Jupiter price
- `POST /api/treasury/dust-sweep` — builds N Jupiter token→SOL swap txs for Phantom batch signing
- `POST /api/treasury/sweep-record`, `GET /api/treasury/sweep-history` — persists/lists sweeps (MongoDB `sweep_history`)
- Frontend: `BuyAndBurnPanel` + `DustSweepPanel` in `/app/frontend/src/components/TreasuryAdvanced.js` mounted in `/treasury-recovery` (password-gated)
- Burn flow: Phantom signs (1) Jupiter swap, then (2) SPL transferChecked to `1nc1nerator11111111111111111111111111111111`
- Sweep flow: sequential Phantom signing, partial-success tolerant, refresh + record on completion

### Payment Engine mock data stripped (2026-02-13)
- `/payment` no longer shows fake $28,837.50 fiat balances
- Now displays only real Treasury SOL + USDC SPL balance (live RPC), real fee revenue, and "NOT INTEGRATED" badges for non-crypto rails
- Transparency banner clarifies that funds shown are not extractable from this page

## Implemented (2026-02-12)
### Backend endpoints
- `GET /api/health` — 200 healthy
- `GET /api/token-mint`, `POST /api/token-mint`, `DELETE /api/token-mint` (MongoDB CRUD)
- `GET /api/jupiter-price?mint=` — uses lite-api.jup.ag/price/v3
- `GET /api/solana-balance?owner=` — proxies Solana RPC (SOL + SPL tokens)
- `GET /api/token-live-stats?mint=` — Jupiter + Birdeye fallback
- `POST /api/swap-quote`, `POST /api/create-swap-tx` — Jupiter swap v1 (lite-api.jup.ag/swap/v1)
- `POST /api/generate-mission` — Anthropic Claude or local fallback

### Frontend pages (12 routes)
- `/` Command Centre — phases, stats, events stream, waveform, QA + Treasury Recovery link
- `/yabbai` Token App — OHLCV chart, swap panel
- `/launch` Launch — launchpad selector + mint registration + Recovery link
- `/payment` Payment Engine — 12 rails
- `/mission` Mission Builder — typewriter generator
- `/wallet` Wallet — Phantom connect + lookup
- `/withdraw` Withdraw — Phantom-signed transfer
- `/treasury-recovery` ★ Treasury Recovery — real balance, security warnings, quick buttons (Max/Half/50/100), Phantom signing, Solscan link success state
- `/pulse` API Pulse — 20 API cards (was `/api-pulse`, renamed because `/api*` ingress conflict)
- `/basham` Gold Harvester
- `/side-hustle` Signal feed
- `/promo` Promo generator

## Treasury Recovery Page Highlights
- Treasury wallet: `7dzgCA8G55VytZ8PS1b99rbbctzCgJbnEoBEYBnn15YR`
- Destination pre-filled: `8e6ogxfUnj6YXHp1tR4Kj1ytSkmEhLhi2fbKqRVxUHPi`
- Quick buttons: MAX (balance - fee), HALF, 50 SOL, 100 SOL
- Security protocol banner (4 warnings)
- Phantom direct-API signing pattern (window.solana)
- Success state: ✓ animation, tx signature, Solscan link, "Extract More" / "Return to Command"
- Auto-refresh balance every 30s
- Test IDs on every interactive element

## P1 Backlog
- ✅ Server-side cache (TTL 8s) for jupiter-price and solana-balance — IMPLEMENTED
- ✅ Mission page wired to Emergent LLM (Claude Sonnet 4.5 via emergentintegrations) — IMPLEMENTED
- ✅ Password protect /treasury-recovery (BashChill1980! via bcrypt + session token) — IMPLEMENTED
- ✅ Recovery transaction history (MongoDB collection `recovery_history`, displayed on page) — IMPLEMENTED
- ✅ Optional 0.25% protocol fee toggle (FEE_BPS=25, FEE_WALLET configurable in .env) — IMPLEMENTED
- Loading skeletons for treasury/wallet balance fetches

## P2 Backlog
- ✅ Persist successful recoveries even if `/api/recovery/record` POST fails — IMPLEMENTED (localStorage retry queue, drained on every page load)
- ✅ Rotate recovery password via admin command — IMPLEMENTED (`/app/backend/rotate_recovery_pwd.py <new_password>` updates bcrypt hash in `.env`)
- ✅ Solscan link beside treasury address — IMPLEMENTED
- ✅ Fee revenue dashboard widget on Command Centre — IMPLEMENTED (`GET /api/fee-revenue?days=30` returns totalSol, totalUsd, SOL price, count)
- Admin auth on /treasury-recovery — DONE (bcrypt password gate)
- Persist transaction history for recoveries — DONE
- Multi-signature flow option
- Export promo frames as PNG

## Test Credentials
None required — no auth in current scope.
