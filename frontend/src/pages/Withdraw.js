import React, { useState, useEffect, useCallback } from 'react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const FEE_BUFFER = 0.005; // SOL reserved for tx fees

export default function Withdraw() {
  // Wallet state
  const [phantomConn, setPhantomConn] = useState(false);
  const [walletAddr, setWalletAddr] = useState('');
  const [walletBal, setWalletBal] = useState(null);
  const [balLoading, setBalLoading] = useState(false);

  // Sweep form
  const [destination, setDestination] = useState('');
  const [amountSol, setAmountSol] = useState('');
  const [sweepPct, setSweepPct] = useState(null); // null | 25 | 50 | 75 | 100

  // Tx state
  const [txStatus, setTxStatus] = useState(null); // null | 'pending' | 'success' | 'error'
  const [txSig, setTxSig] = useState('');
  const [txMsg, setTxMsg] = useState('');
  const [sweepPulse, setSweepPulse] = useState(false);

  // History
  const [history, setHistory] = useState([]);

  // ─── Load wallet balance ───────────────────────────────────────────────
  const fetchBalance = useCallback(async (addr) => {
    if (!addr) return;
    setBalLoading(true);
    try {
      const res = await fetch(`${API}/solana-balance?owner=${addr}`);
      const data = await res.json();
      if (data.ok) setWalletBal(data.sol);
    } catch {}
    setBalLoading(false);
  }, []);

  // ─── Connect Phantom ──────────────────────────────────────────────────
  const connectWallet = async () => {
    try {
      const solana = window.solana;
      if (!solana?.isPhantom) {
        window.open('https://phantom.app/', '_blank');
        return;
      }
      const resp = await solana.connect();
      const addr = resp.publicKey.toString();
      setPhantomConn(true);
      setWalletAddr(addr);
      fetchBalance(addr);
    } catch (e) {
      setTxMsg('Wallet connection declined.');
      setTxStatus('error');
    }
  };

  // Auto-detect already-connected Phantom
  useEffect(() => {
    const solana = window.solana;
    if (solana?.isPhantom && solana.isConnected) {
      const addr = solana.publicKey?.toString() || '';
      setPhantomConn(true);
      setWalletAddr(addr);
      fetchBalance(addr);
    }
  }, [fetchBalance]);

  // Refresh balance every 15s when connected
  useEffect(() => {
    if (!walletAddr) return;
    const id = setInterval(() => fetchBalance(walletAddr), 15000);
    return () => clearInterval(id);
  }, [walletAddr, fetchBalance]);

  // ─── Percentage presets ───────────────────────────────────────────────
  const safeSweepable = walletBal !== null ? Math.max(0, walletBal - FEE_BUFFER) : 0;

  const applyPct = (pct) => {
    setSweepPct(pct);
    const amt = pct === 100
      ? safeSweepable
      : (walletBal * pct) / 100;
    setAmountSol(Math.max(0, amt - (pct === 100 ? 0 : 0)).toFixed(4));
  };

  const handleAmountChange = (val) => {
    setAmountSol(val);
    setSweepPct(null); // clear preset indicator
  };

  // ─── Send sweep ───────────────────────────────────────────────────────
  const handleSweep = async () => {
    const amt = parseFloat(amountSol);
    if (!amt || amt <= 0) { setTxMsg('Enter a valid SOL amount.'); setTxStatus('error'); return; }
    if (!destination || destination.length < 32) { setTxMsg('Enter a valid destination address.'); setTxStatus('error'); return; }
    if (!phantomConn) { setTxMsg('Connect your Phantom wallet first.'); setTxStatus('error'); return; }
    if (walletBal !== null && amt > safeSweepable + FEE_BUFFER) {
      setTxMsg(`Amount exceeds wallet balance (${walletBal.toFixed(4)} SOL). Max safe: ${safeSweepable.toFixed(4)} SOL`);
      setTxStatus('error');
      return;
    }

    setTxStatus('pending');
    setTxMsg('');
    setSweepPulse(false);

    try {
      const web3 = await import('@solana/web3.js');
      const { Connection, PublicKey, SystemProgram, Transaction, LAMPORTS_PER_SOL, ComputeBudgetProgram } = web3;

      const connection = new Connection('https://api.mainnet-beta.solana.com', 'confirmed');
      const solana = window.solana;
      const fromPubkey = solana.publicKey;
      const toPubkey = new PublicKey(destination.trim());
      const lamports = Math.floor(amt * LAMPORTS_PER_SOL);

      const { blockhash } = await connection.getLatestBlockhash();
      const tx = new Transaction({ recentBlockhash: blockhash, feePayer: fromPubkey });
      tx.add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 5000 }));
      tx.add(SystemProgram.transfer({ fromPubkey, toPubkey, lamports }));

      const signed = await solana.signTransaction(tx);
      const sig = await connection.sendRawTransaction(signed.serialize());
      await connection.confirmTransaction(sig, 'confirmed');

      setTxSig(sig);
      setTxStatus('success');
      setSweepPulse(true);
      setTxMsg(`✓ ${amt.toFixed(4)} SOL swept to safety`);

      // Record in history
      setHistory(prev => [{
        sig: sig.slice(0, 16) + '...',
        fullSig: sig,
        amt: amt.toFixed(4),
        to: destination.slice(0, 8) + '...' + destination.slice(-4),
        ts: new Date().toLocaleTimeString(),
      }, ...prev].slice(0, 10));

      // Reset form & refresh balance
      setAmountSol('');
      setSweepPct(null);
      setTimeout(() => fetchBalance(walletAddr), 3000);
      setTimeout(() => setSweepPulse(false), 4000);
    } catch (e) {
      setTxStatus('error');
      setTxMsg('Transaction failed: ' + (e.message || 'Unknown error — check Phantom'));
    }
  };

  const disconnectWallet = () => {
    window.solana?.disconnect?.();
    setPhantomConn(false);
    setWalletAddr('');
    setWalletBal(null);
    setAmountSol('');
    setSweepPct(null);
    setTxStatus(null);
  };

  const canSweep = phantomConn && destination.length >= 32 && parseFloat(amountSol) > 0 && txStatus !== 'pending';
  const totalSwept = history.reduce((a, h) => a + parseFloat(h.amt), 0);

  return (
    <div className="page-container fade-in">
      <p className="section-label fade-in-1">⚡ FUND RECOVERY</p>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 28 }}>
        <h1 className="font-display fade-in-2" style={{ fontSize: 36, fontWeight: 900, color: '#9945FF' }}>
          TREASURY SWEEP
        </h1>
        <span className="badge badge-purple">MAINNET-BETA</span>
        {phantomConn && <span className="badge badge-green">WALLET CONNECTED</span>}
      </div>

      {/* ── Step 1: Connect wallet ── */}
      <div className="card fade-in-2" style={{
        marginBottom: 20,
        borderColor: phantomConn ? 'rgba(20,241,149,0.35)' : 'rgba(153,69,255,0.2)',
        position: 'relative', overflow: 'hidden',
      }}>
        {phantomConn && (
          <div style={{
            position: 'absolute', inset: 0, pointerEvents: 'none',
            background: 'radial-gradient(ellipse at top left, rgba(20,241,149,0.06) 0%, transparent 60%)',
          }} />
        )}
        <div style={{ position: 'relative', zIndex: 1 }}>
          <p className="section-label" style={{ marginBottom: 12 }}>
            STEP 1 — CONNECT WALLET TO SWEEP FROM
          </p>
          <p style={{
            fontFamily: 'var(--font-mono)', fontSize: 11, color: '#3a5070',
            marginBottom: 14, lineHeight: 1.7,
          }}>
            Connect the Phantom wallet that <span style={{ color: '#e8f0ff' }}>controls the funds you want to recover</span>.
            If you want to sweep the site treasury, import that keypair into Phantom first.
          </p>

          {!phantomConn ? (
            <button
              className="btn btn-primary"
              style={{ fontSize: 13, padding: '12px 28px' }}
              onClick={connectWallet}
              data-testid="connect-phantom-btn"
            >
              👻 Connect Phantom
            </button>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span className="live-dot" />
                  <span style={{ fontFamily: 'var(--font-display)', fontSize: 14, color: '#14F195' }}>Connected</span>
                </div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#e8f0ff', wordBreak: 'break-all' }}>
                  {walletAddr}
                </div>
              </div>
              <button className="btn btn-outline btn-sm" onClick={disconnectWallet}>Disconnect</button>
            </div>
          )}
        </div>
      </div>

      {/* ── Wallet balance hero (only when connected) ── */}
      {phantomConn && (
        <div
          className="card fade-in"
          style={{
            marginBottom: 20,
            borderColor: sweepPulse ? '#14F195' : 'rgba(153,69,255,0.2)',
            boxShadow: sweepPulse ? '0 0 40px rgba(20,241,149,0.35)' : 'none',
            transition: 'all 0.6s',
            textAlign: 'center', padding: '28px 24px',
          }}
        >
          <p className="section-label" style={{ marginBottom: 8 }}>WALLET BALANCE</p>
          {balLoading ? (
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 14, color: '#3a5070' }}>Fetching balance...</div>
          ) : walletBal !== null ? (
            <>
              <div style={{
                fontFamily: 'var(--font-display)', fontSize: 52, fontWeight: 900, lineHeight: 1,
                background: 'linear-gradient(135deg, #e8f0ff 0%, #9945FF 50%, #14F195 100%)',
                WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
                marginBottom: 4,
              }}>
                {walletBal.toFixed(4)}
                <span style={{
                  fontFamily: 'var(--font-mono)', fontSize: 20, marginLeft: 8,
                  background: 'none', WebkitTextFillColor: '#9945FF',
                }}>SOL</span>
              </div>
              <div style={{
                fontFamily: 'var(--font-mono)', fontSize: 11, color: '#3a5070', marginBottom: 16,
              }}>
                ≈ ${(walletBal * 178.42).toFixed(2)} USD &nbsp;·&nbsp;
                <span style={{ color: '#14F195' }}>Safe to sweep: {safeSweepable.toFixed(4)} SOL</span>
                &nbsp;(reserves {FEE_BUFFER} SOL for fees)
              </div>

              {/* ── % preset strip ── */}
              <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
                {[
                  { pct: 25, label: '25%' },
                  { pct: 50, label: '50%' },
                  { pct: 75, label: '75%' },
                  { pct: 100, label: '⚡ MAX SAFE' },
                ].map(({ pct, label }) => (
                  <button
                    key={pct}
                    className={`btn btn-sm ${sweepPct === pct ? (pct === 100 ? 'btn-green' : 'btn-primary') : 'btn-outline'}`}
                    style={{
                      minWidth: pct === 100 ? 110 : 60,
                      boxShadow: sweepPct === pct && pct === 100 ? '0 0 16px rgba(20,241,149,0.35)' : 'none',
                    }}
                    onClick={() => applyPct(pct)}
                    disabled={safeSweepable <= 0}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: '#3a5070' }}>
              Unable to fetch balance — enter amount manually
            </div>
          )}
        </div>
      )}

      <div className="grid-2 fade-in-3" style={{ marginBottom: 24 }}>
        {/* ── Sweep form ── */}
        <div className="card">
          <p className="section-label" style={{ marginBottom: 14 }}>STEP 2 — SWEEP TO SAFE WALLET</p>

          {/* Destination */}
          <div style={{ marginBottom: 14 }}>
            <label className="stat-label" style={{ display: 'block', marginBottom: 5 }}>
              DESTINATION (YOUR SAFE WALLET ADDRESS)
            </label>
            <input
              className="field"
              placeholder="Enter your main wallet address..."
              value={destination}
              onChange={e => setDestination(e.target.value)}
              data-testid="destination-address"
              style={{ borderColor: destination.length >= 32 ? 'rgba(20,241,149,0.3)' : 'rgba(153,69,255,0.18)' }}
            />
            {destination.length > 0 && destination.length < 32 && (
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: '#F5A623', marginTop: 4 }}>
                Address looks too short — Solana addresses are 32–44 characters
              </div>
            )}
          </div>

          {/* Amount */}
          <div style={{ marginBottom: 16 }}>
            <label className="stat-label" style={{ display: 'block', marginBottom: 5 }}>
              AMOUNT TO SWEEP (SOL)
            </label>
            <div style={{ position: 'relative' }}>
              <input
                className="field"
                type="number"
                step="0.001"
                min="0.001"
                placeholder="0.0000"
                value={amountSol}
                onChange={e => handleAmountChange(e.target.value)}
                data-testid="sweep-amount"
                style={{
                  paddingRight: 60,
                  borderColor: sweepPct === 100
                    ? 'rgba(20,241,149,0.4)'
                    : sweepPct
                    ? 'rgba(153,69,255,0.4)'
                    : 'rgba(153,69,255,0.18)',
                }}
              />
              <span style={{
                position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, color: '#9945FF',
              }}>SOL</span>
            </div>
            {amountSol && walletBal !== null && (
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: '#3a5070', marginTop: 4 }}>
                ≈ ${(parseFloat(amountSol) * 178.42).toFixed(2)} USD
              </div>
            )}
          </div>

          {/* FROM label */}
          {phantomConn && (
            <div style={{
              padding: '8px 12px', borderRadius: 4, marginBottom: 14,
              background: 'rgba(153,69,255,0.06)', border: '1px solid rgba(153,69,255,0.15)',
              fontFamily: 'var(--font-mono)', fontSize: 10,
            }}>
              <div style={{ color: '#3a5070', marginBottom: 3 }}>FROM (connected wallet)</div>
              <div style={{ color: '#e8f0ff', wordBreak: 'break-all' }}>{walletAddr}</div>
            </div>
          )}

          {/* Status message */}
          {txStatus && (
            <div style={{
              padding: '10px 14px', borderRadius: 6, marginBottom: 14,
              background: txStatus === 'success'
                ? 'rgba(20,241,149,0.08)'
                : txStatus === 'error'
                ? 'rgba(255,60,60,0.08)'
                : 'rgba(153,69,255,0.08)',
              border: `1px solid ${
                txStatus === 'success'
                  ? 'rgba(20,241,149,0.3)'
                  : txStatus === 'error'
                  ? 'rgba(255,60,60,0.3)'
                  : 'rgba(153,69,255,0.3)'
              }`,
              fontFamily: 'var(--font-mono)', fontSize: 11,
              color: txStatus === 'success' ? '#14F195' : txStatus === 'error' ? '#ff6060' : '#9945FF',
            }}>
              {txStatus === 'pending' ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{
                    display: 'inline-block', width: 12, height: 12,
                    border: '2px solid rgba(153,69,255,0.3)', borderTopColor: '#9945FF',
                    borderRadius: '50%', animation: 'spin 0.8s linear infinite',
                  }} />
                  Broadcasting to Solana mainnet...
                </div>
              ) : txMsg}
              {txStatus === 'success' && txSig && (
                <a
                  href={`https://solscan.io/tx/${txSig}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ display: 'block', marginTop: 6, color: '#9945FF', fontSize: 10 }}
                >
                  View on Solscan ↗
                </a>
              )}
            </div>
          )}

          {/* Main sweep button */}
          <button
            className={`btn ${sweepPulse ? 'btn-green' : 'btn-primary'}`}
            style={{
              width: '100%',
              fontSize: 14,
              padding: '16px',
              boxShadow: sweepPulse
                ? '0 0 40px rgba(20,241,149,0.6)'
                : canSweep
                ? '0 0 20px rgba(153,69,255,0.35)'
                : 'none',
              transition: 'all 0.4s',
              opacity: canSweep ? 1 : 0.55,
            }}
            onClick={handleSweep}
            disabled={!canSweep}
            data-testid="sweep-btn"
          >
            {txStatus === 'pending' ? (
              <>
                <span style={{
                  display: 'inline-block', width: 14, height: 14,
                  border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff',
                  borderRadius: '50%', animation: 'spin 0.8s linear infinite', marginRight: 8,
                }} />
                SWEEPING TO SAFETY...
              </>
            ) : sweepPulse ? (
              <>✓ FUNDS SECURED — {amountSol || '0'} SOL SWEPT</>
            ) : (
              <>⚡ SWEEP {amountSol ? `${amountSol} SOL` : 'FUNDS'} TO SAFETY</>
            )}
          </button>

          {!phantomConn && (
            <p style={{
              fontFamily: 'var(--font-mono)', fontSize: 10, color: '#3a5070',
              textAlign: 'center', marginTop: 8,
            }}>
              Connect Phantom wallet above to enable sweep
            </p>
          )}
        </div>

        {/* ── Right panel ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* How it works */}
          <div className="card">
            <p className="section-label" style={{ marginBottom: 12 }}>HOW TREASURY SWEEP WORKS</p>
            <ol style={{
              fontFamily: 'var(--font-mono)', fontSize: 11, color: '#3a5070',
              lineHeight: 2.2, paddingLeft: 20,
            }}>
              {[
                ['Connect', 'Phantom wallet that holds the funds you want to recover'],
                ['Check balance', 'Your live SOL balance is fetched automatically'],
                ['Set destination', 'Enter your main/safer wallet address as the recipient'],
                ['Choose amount', 'Use % presets or enter exact amount (MAX SAFE leaves fees)'],
                ['Sweep', 'Phantom prompts to sign — transaction broadcast to mainnet'],
                ['Confirmed', 'Funds arrive in your destination wallet in seconds'],
              ].map(([step, desc], i) => (
                <li key={i}>
                  <span style={{ color: '#9945FF', fontWeight: 700 }}>{step}</span>
                  <span style={{ color: '#2a4060' }}> — {desc}</span>
                </li>
              ))}
            </ol>
          </div>

          {/* Sweep history */}
          {history.length > 0 && (
            <div className="card" style={{ borderColor: 'rgba(20,241,149,0.15)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <p className="section-label" style={{ margin: 0 }}>SWEEP HISTORY (THIS SESSION)</p>
                <span className="badge badge-green">{history.length} TXS</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {history.map((h, i) => (
                  <div key={i} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '8px 10px',
                    background: 'rgba(20,241,149,0.04)',
                    border: '1px solid rgba(20,241,149,0.1)',
                    borderRadius: 5,
                  }}>
                    <div>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 900, color: '#14F195' }}>
                        ✓ {h.amt} SOL
                      </span>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: '#3a5070', marginLeft: 8 }}>
                        → {h.to}
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#3a5070' }}>{h.ts}</span>
                      <a
                        href={`https://solscan.io/tx/${h.fullSig}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#9945FF' }}
                      >
                        Solscan ↗
                      </a>
                    </div>
                  </div>
                ))}
              </div>
              <div className="divider" />
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#e8f0ff' }}>
                Total recovered this session:&nbsp;
                <span style={{ color: '#14F195', fontWeight: 700 }}>{totalSwept.toFixed(4)} SOL</span>
                &nbsp;≈ <span style={{ color: '#9945FF' }}>${(totalSwept * 178.42).toFixed(2)}</span>
              </div>
            </div>
          )}

          {/* Safety note */}
          <div className="card" style={{ borderColor: 'rgba(245,166,35,0.15)' }}>
            <p className="section-label" style={{ color: '#F5A623', marginBottom: 10 }}>⚠ SECURITY NOTES</p>
            <ul style={{
              fontFamily: 'var(--font-mono)', fontSize: 10, color: '#3a5070',
              lineHeight: 2, paddingLeft: 16,
            }}>
              <li>Only you have access — this page is yours</li>
              <li>Phantom <strong style={{ color: '#e8f0ff' }}>never exposes your private key</strong></li>
              <li>Transactions are broadcast directly to Solana mainnet</li>
              <li>MAX SAFE always reserves {FEE_BUFFER} SOL for network fees</li>
              <li>Verify destination address carefully before sweeping</li>
              <li>Solscan link provided for every confirmed transaction</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
