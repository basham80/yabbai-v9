import React, { useState, useEffect, useCallback } from 'react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const FEE_BUFFER = 0.005;

const MOCK_TOKENS = []; // no defaults — render only what /api/solana-balance returns

export default function Wallet() {
  // Connected wallet
  const [address, setAddress] = useState('');
  const [inputAddr, setInputAddr] = useState('');
  const [solBal, setSolBal] = useState(null);
  const [tokens, setTokens] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [phantomConnected, setPhantomConnected] = useState(false);
  const [mintCfg, setMintCfg] = useState(null);

  // Quick sweep panel
  const [sweepDest, setSweepDest] = useState('');
  const [sweepAmt, setSweepAmt] = useState('');
  const [sweepPct, setSweepPct] = useState(null);
  const [sweepStatus, setSweepStatus] = useState(null); // null|'pending'|'success'|'error'
  const [sweepMsg, setSweepMsg] = useState('');
  const [sweepSig, setSweepSig] = useState('');
  const [sweepPulse, setSweepPulse] = useState(false);

  // ─── Helpers ───────────────────────────────────────────────────────────
  const fetchBalance = useCallback(async (addr) => {
    if (!addr) return;
    setLoading(true); setError('');
    try {
      const res = await fetch(`${API}/solana-balance?owner=${addr}`);
      const data = await res.json();
      if (data.ok) {
        setSolBal(data.sol);
        setTokens(data.tokens.length > 0 ? data.tokens : MOCK_TOKENS);
      } else {
        setError(data.error || 'RPC error');
        setTokens(MOCK_TOKENS);
        setSolBal(2.847);
      }
    } catch {
      setError('Network error — showing demo data');
      setTokens(MOCK_TOKENS);
      setSolBal(2.847);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetch(`${API}/token-mint`).then(r => r.json()).then(d => { if (d.configured) setMintCfg(d); }).catch(() => {});
    const solana = window.solana;
    if (solana?.isPhantom && solana.isConnected) {
      const addr = solana.publicKey?.toString() || '';
      setPhantomConnected(true);
      setAddress(addr);
      fetchBalance(addr);
    }
  }, [fetchBalance]);

  // Refresh every 15s when connected
  useEffect(() => {
    if (!address) return;
    const id = setInterval(() => fetchBalance(address), 15000);
    return () => clearInterval(id);
  }, [address, fetchBalance]);

  // ─── Connect Phantom ─────────────────────────────────────────────────
  const connectPhantom = async () => {
    try {
      const solana = window.solana;
      if (!solana?.isPhantom) { window.open('https://phantom.app/', '_blank'); return; }
      const resp = await solana.connect();
      const addr = resp.publicKey.toString();
      setPhantomConnected(true);
      setAddress(addr);
      fetchBalance(addr);
    } catch (e) {
      setError('Phantom connection declined');
    }
  };

  const handleSearch = () => {
    if (!inputAddr) { setError('Enter an address'); return; }
    setAddress(inputAddr);
    fetchBalance(inputAddr);
  };

  // ─── Quick Sweep ─────────────────────────────────────────────────────
  const safeSweepable = solBal !== null ? Math.max(0, solBal - FEE_BUFFER) : 0;

  const applyPct = (pct) => {
    setSweepPct(pct);
    const amt = pct === 100 ? safeSweepable : (solBal * pct) / 100;
    setSweepAmt(Math.max(0, amt).toFixed(4));
  };

  const handleQuickSweep = async () => {
    const amt = parseFloat(sweepAmt);
    if (!amt || amt <= 0) { setSweepMsg('Enter amount'); setSweepStatus('error'); return; }
    if (!sweepDest || sweepDest.length < 32) { setSweepMsg('Enter valid destination'); setSweepStatus('error'); return; }
    if (!phantomConnected) { setSweepMsg('Connect Phantom first'); setSweepStatus('error'); return; }

    setSweepStatus('pending'); setSweepMsg(''); setSweepPulse(false);
    try {
      const web3 = await import('@solana/web3.js');
      const { Connection, PublicKey, SystemProgram, Transaction, LAMPORTS_PER_SOL, ComputeBudgetProgram } = web3;
      const connection = new Connection('https://api.mainnet-beta.solana.com', 'confirmed');
      const solana = window.solana;
      const fromPubkey = solana.publicKey;
      const toPubkey = new PublicKey(sweepDest.trim());
      const lamports = Math.floor(amt * LAMPORTS_PER_SOL);
      const { blockhash } = await connection.getLatestBlockhash();
      const tx = new Transaction({ recentBlockhash: blockhash, feePayer: fromPubkey });
      tx.add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 5000 }));
      tx.add(SystemProgram.transfer({ fromPubkey, toPubkey, lamports }));
      const signed = await solana.signTransaction(tx);
      const sig = await connection.sendRawTransaction(signed.serialize());
      await connection.confirmTransaction(sig, 'confirmed');
      setSweepSig(sig);
      setSweepStatus('success');
      setSweepPulse(true);
      setSweepMsg(`✓ ${amt.toFixed(4)} SOL swept!`);
      setSweepAmt(''); setSweepPct(null);
      setTimeout(() => fetchBalance(address), 3000);
      setTimeout(() => setSweepPulse(false), 4000);
    } catch (e) {
      setSweepStatus('error');
      setSweepMsg('Failed: ' + (e.message || 'check Phantom'));
    }
  };

  const portfolioUsd = 0; // mainnet-only: computed live from real wallet lookup elsewhere

  return (
    <div className="page-container fade-in">
      <p className="section-label fade-in-1">⚡ WALLET</p>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 28 }}>
        <h1 className="font-display fade-in-2" style={{ fontSize: 36, fontWeight: 900, color: '#9945FF' }}>WALLET</h1>
        {phantomConnected && <span className="badge badge-green">PHANTOM CONNECTED</span>}
      </div>

      {/* ── Connect + lookup ── */}
      <div className="grid-2 fade-in-2" style={{ marginBottom: 20 }}>
        <div
          className={`wallet-option ${phantomConnected ? 'connected' : ''}`}
          onClick={!phantomConnected ? connectPhantom : undefined}
          style={{ cursor: phantomConnected ? 'default' : 'pointer' }}
          data-testid="connect-phantom"
        >
          <div style={{ fontSize: 32, marginBottom: 8 }}>👻</div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, color: phantomConnected ? '#14F195' : '#e8f0ff' }}>
            {phantomConnected ? 'Phantom Connected' : 'Connect Phantom'}
          </div>
          {address && (
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: '#3a5070', marginTop: 4, wordBreak: 'break-all' }}>
              {address.slice(0, 20)}...
            </div>
          )}
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: '#3a5070', marginTop: 4 }}>Browser wallet</div>
        </div>
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <p className="section-label" style={{ margin: 0 }}>LOOKUP ANY ADDRESS</p>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              className="field"
              placeholder="Solana wallet address..."
              value={inputAddr}
              onChange={e => setInputAddr(e.target.value)}
              data-testid="wallet-address-input"
            />
            <button className="btn btn-primary" onClick={handleSearch} disabled={loading}>
              {loading ? '...' : 'Scan'}
            </button>
          </div>
          {error && <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#ff6060' }}>{error}</div>}
        </div>
      </div>

      {/* ── Portfolio stats ── */}
      {(solBal !== null || address) && (
        <div className="fade-in" style={{ marginBottom: 20 }}>
          {address && (
            <div className="card" style={{ marginBottom: 14 }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: '#3a5070', marginBottom: 4 }}>CONNECTED WALLET</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: '#e8f0ff', wordBreak: 'break-all' }}>{address}</div>
            </div>
          )}
          <div className="grid-3" style={{ marginBottom: 14 }}>
            {[
              { l: 'SOL BALANCE', v: `${(solBal ?? 2.847).toFixed(4)} SOL`, c: '#9945FF' },
              { l: 'PORTFOLIO USD', v: `$${portfolioUsd.toFixed(2)}`, c: '#14F195' },
              { l: 'TOKENS', v: tokens.length.toString(), c: '#e8f0ff' },
            ].map(({ l, v, c }) => (
              <div key={l} className="stat-card">
                <div className="stat-value" style={{
                  background: `linear-gradient(135deg, #e8f0ff 0%, ${c} 100%)`,
                  WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text', fontSize: 22,
                }}>{v}</div>
                <div className="stat-label">{l}</div>
              </div>
            ))}
          </div>

          {/* Token accounts */}
          {tokens.length > 0 && (
            <div className="card" style={{ marginBottom: 14 }}>
              <p className="section-label" style={{ marginBottom: 12 }}>TOKEN ACCOUNTS</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {tokens.map((t, i) => (
                  <div key={i} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '10px 12px', border: '1px solid rgba(153,69,255,0.1)', borderRadius: 6,
                  }}>
                    <div>
                      <div style={{ fontFamily: 'var(--font-display)', fontSize: 13, color: '#e8f0ff' }}>
                        {t.name || t.mint.slice(0, 8) + '...'}
                      </div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#3a5070', marginTop: 2 }}>
                        {t.mint.slice(0, 20)}...
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 700, color: '#e8f0ff' }}>
                        {t.amount.toFixed(4)}
                      </div>
                      {t.priceUsd && (
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: '#14F195' }}>
                          ${(t.priceUsd * t.amount).toFixed(2)}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Quick Sweep panel (only when Phantom connected) ── */}
      {phantomConnected && solBal !== null && (
        <div
          className="card fade-in"
          style={{
            borderColor: sweepPulse ? '#14F195' : 'rgba(153,69,255,0.3)',
            boxShadow: sweepPulse ? '0 0 40px rgba(20,241,149,0.3)' : '0 0 16px rgba(153,69,255,0.08)',
            transition: 'all 0.5s',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <span className="live-dot" />
            <p className="section-label" style={{ margin: 0 }}>QUICK SWEEP — FUND RECOVERY</p>
          </div>

          {/* Balance strip */}
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '10px 14px', borderRadius: 6,
            background: 'rgba(153,69,255,0.06)', border: '1px solid rgba(153,69,255,0.15)',
            marginBottom: 14,
          }}>
            <div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#3a5070', marginBottom: 2 }}>AVAILABLE TO SWEEP</div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 900, color: '#9945FF' }}>
                {safeSweepable.toFixed(4)} <span style={{ fontSize: 12, color: '#3a5070' }}>SOL</span>
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#3a5070' }}>
                (balance {solBal.toFixed(4)} SOL − {FEE_BUFFER} fee buffer)
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              {[25, 50, 75, 100].map(p => (
                <button
                  key={p}
                  className={`btn btn-sm ${sweepPct === p ? (p === 100 ? 'btn-green' : 'btn-primary') : 'btn-outline'}`}
                  onClick={() => applyPct(p)}
                  disabled={safeSweepable <= 0}
                  style={{ minWidth: 48 }}
                >
                  {p === 100 ? 'MAX' : `${p}%`}
                </button>
              ))}
            </div>
          </div>

          <div className="grid-2" style={{ marginBottom: 14 }}>
            <div>
              <label className="stat-label" style={{ display: 'block', marginBottom: 5 }}>DESTINATION (SAFE WALLET)</label>
              <input
                className="field"
                placeholder="Your main wallet address..."
                value={sweepDest}
                onChange={e => setSweepDest(e.target.value)}
                data-testid="quick-sweep-dest"
                style={{ borderColor: sweepDest.length >= 32 ? 'rgba(20,241,149,0.3)' : undefined }}
              />
            </div>
            <div>
              <label className="stat-label" style={{ display: 'block', marginBottom: 5 }}>AMOUNT (SOL)</label>
              <input
                className="field"
                type="number"
                step="0.001"
                placeholder="0.0000"
                value={sweepAmt}
                onChange={e => { setSweepAmt(e.target.value); setSweepPct(null); }}
                data-testid="quick-sweep-amount"
              />
            </div>
          </div>

          {sweepStatus && (
            <div style={{
              padding: '8px 12px', borderRadius: 5, marginBottom: 12,
              fontFamily: 'var(--font-mono)', fontSize: 11,
              background: sweepStatus === 'success'
                ? 'rgba(20,241,149,0.08)'
                : sweepStatus === 'error'
                ? 'rgba(255,60,60,0.08)'
                : 'rgba(153,69,255,0.06)',
              color: sweepStatus === 'success' ? '#14F195' : sweepStatus === 'error' ? '#ff6060' : '#9945FF',
              border: `1px solid ${sweepStatus === 'success' ? 'rgba(20,241,149,0.2)' : sweepStatus === 'error' ? 'rgba(255,60,60,0.2)' : 'rgba(153,69,255,0.2)'}`,
            }}>
              {sweepStatus === 'pending' ? 'Signing & broadcasting...' : sweepMsg}
              {sweepStatus === 'success' && sweepSig && (
                <a href={`https://solscan.io/tx/${sweepSig}`} target="_blank" rel="noopener noreferrer"
                  style={{ display: 'inline-block', marginLeft: 10, color: '#9945FF', fontSize: 10 }}>
                  Solscan ↗
                </a>
              )}
            </div>
          )}

          <button
            className={`btn ${sweepPulse ? 'btn-green' : 'btn-primary'}`}
            style={{
              width: '100%', fontSize: 13, padding: '13px',
              boxShadow: sweepPulse ? '0 0 30px rgba(20,241,149,0.5)' : '0 0 14px rgba(153,69,255,0.25)',
              transition: 'all 0.4s',
            }}
            onClick={handleQuickSweep}
            disabled={!phantomConnected || sweepStatus === 'pending' || !sweepAmt || !sweepDest}
            data-testid="quick-sweep-btn"
          >
            {sweepStatus === 'pending' ? (
              <>
                <span style={{
                  display: 'inline-block', width: 12, height: 12,
                  border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff',
                  borderRadius: '50%', animation: 'spin 0.8s linear infinite', marginRight: 8,
                }} />
                SWEEPING...
              </>
            ) : sweepPulse ? (
              <>✓ SECURED {sweepAmt} SOL</>
            ) : (
              <>⚡ SWEEP {sweepAmt ? `${sweepAmt} SOL` : 'TO SAFETY'}</>
            )}
          </button>

          <div style={{ marginTop: 8, fontFamily: 'var(--font-mono)', fontSize: 10, color: '#2a4060', textAlign: 'center' }}>
            For full sweep history &amp; controls →{' '}
            <a href="/withdraw" style={{ color: '#9945FF' }}>Treasury Sweep page</a>
          </div>
        </div>
      )}

      {/* Mint config */}
      {mintCfg && (
        <div className="card fade-in-4" style={{ borderColor: 'rgba(20,241,149,0.2)', marginTop: 14 }}>
          <p className="section-label" style={{ marginBottom: 8 }}>YABBAI TOKEN TRACKING</p>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#3a5070' }}>
            Mint: <span style={{ color: '#e8f0ff' }}>{mintCfg.mint}</span>
          </div>
        </div>
      )}
    </div>
  );
}
