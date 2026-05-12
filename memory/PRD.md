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
- Admin auth on /treasury-recovery (currently no auth — anyone can attempt extraction; only valid signer succeeds)
- Persist transaction history for recoveries
- Multi-signature flow option
- Export promo frames as PNG

## Test Credentials
None required — no auth in current scope.
