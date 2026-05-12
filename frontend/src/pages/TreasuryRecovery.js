import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Connection, PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL } from '@solana/web3.js';
import toast from 'react-hot-toast';

const TREASURY = '7dzgCA8G55VytZ8PS1b99rbbctzCgJbnEoBEYBnn15YR';
const SECURE_WALLET = '8e6ogxfUnj6YXHp1tR4Kj1ytSkmEhLhi2fbKqRVxUHPi';
const BACKEND = process.env.REACT_APP_BACKEND_URL;
const RPC_URL = 'https://api.mainnet-beta.solana.com';
const TOKEN_KEY = 'yabbai_recovery_token';

export default function TreasuryRecovery() {
  // ── Password gate ──────────────────────────────────────────────────────
  const [token, setToken] = useState(() => sessionStorage.getItem(TOKEN_KEY) || '');
  const [pwd, setPwd] = useState('');
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState('');

  const submitPassword = async (e) => {
    e?.preventDefault?.();
    setAuthError('');
    setAuthBusy(true);
    try {
      const r = await fetch(`${BACKEND}/api/recovery/auth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pwd }),
      });
      if (!r.ok) {
        const e = await r.json().catch(() => ({}));
        throw new Error(e.detail || 'Invalid password');
      }
      const data = await r.json();
      sessionStorage.setItem(TOKEN_KEY, data.token);
      setToken(data.token);
      toast.success('Access granted');
    } catch (err) {
      setAuthError(err.message || 'Authentication failed');
    } finally {
      setAuthBusy(false);
    }
  };

  const logout = () => {
    sessionStorage.removeItem(TOKEN_KEY);
    setToken('');
    setPwd('');
  };

  if (!token) {
    return (
      <div className="page-wrap" style={{ maxWidth: 480 }} data-testid="recovery-auth-gate">
        <div className="glass-card" style={{ padding: 36, marginTop: 60 }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: '#9945FF', letterSpacing: '0.3em' }}>
            ◆ RESTRICTED AREA
          </div>
          <h1 className="page-title" style={{ fontSize: 28, marginTop: 8 }}>Treasury Recovery</h1>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: '#7c98c4', marginBottom: 28 }}>
            Enter the recovery password to access the treasury extraction console.
          </p>
          <form onSubmit={submitPassword}>
            <input
              type="password"
              placeholder="Recovery password"
              value={pwd}
              onChange={(e) => setPwd(e.target.value)}
              autoFocus
              style={inputStyle}
              data-testid="recovery-password-input"
            />
            {authError && (
              <div style={{ marginTop: 12, fontFamily: 'var(--font-mono)', fontSize: 12, color: '#FF6B6B' }} data-testid="auth-error">
                ✕ {authError}
              </div>
            )}
            <button
              type="submit"
              className="btn btn-primary"
              disabled={authBusy || !pwd}
              style={{ width: '100%', marginTop: 20, padding: '14px 20px' }}
              data-testid="recovery-password-submit"
            >
              {authBusy ? 'VERIFYING...' : 'UNLOCK CONSOLE'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return <RecoveryConsole token={token} onLogout={logout} />;
}

// ── Main console (rendered after auth) ────────────────────────────────────
function RecoveryConsole({ token, onLogout }) {
  const [balance, setBalance] = useState(null);
  const [loading, setLoading] = useState(true);
  const [amount, setAmount] = useState('');
  const [destination, setDestination] = useState(SECURE_WALLET);
  const [note, setNote] = useState('');
  const [enableFee, setEnableFee] = useState(false);
  const [feeBpsOverride, setFeeBpsOverride] = useState(null); // user-selected tier
  const [feeConfig, setFeeConfig] = useState({ feeWallet: SECURE_WALLET, feeBps: 25, squadsVault: null, feeTiers: [
    { label: '0.10%', bps: 10 }, { label: '0.25%', bps: 25 }, { label: '0.50%', bps: 50 },
  ] });
  const [useSquads, setUseSquads] = useState(false);
  const [squadsTxB64, setSquadsTxB64] = useState('');
  const [squadsVault, setSquadsVault] = useState(() => localStorage.getItem('yabbai_squads_vault') || '');
  const [phantomConnected, setPhantomConnected] = useState(false);
  const [phantomKey, setPhantomKey] = useState(null);
  const [txStatus, setTxStatus] = useState('idle');
  const [txSig, setTxSig] = useState(null);
  const [txError, setTxError] = useState('');
  const [history, setHistory] = useState([]);

  const fetchBalance = useCallback(async () => {
    try {
      setLoading(true);
      const r = await fetch(`${BACKEND}/api/solana-balance?owner=${TREASURY}`);
      const data = await r.json();
      setBalance(data?.ok ? data.sol : 0);
    } catch { setBalance(0); }
    finally { setLoading(false); }
  }, []);

  const fetchHistory = useCallback(async () => {
    try {
      const r = await fetch(`${BACKEND}/api/recovery/history?token=${encodeURIComponent(token)}&limit=10`);
      const data = await r.json();
      if (data?.ok) setHistory(data.items || []);
    } catch {}
  }, [token]);

  // Drain any queued recovery records that failed to POST last time
  const drainRetryQueue = useCallback(async () => {
    const QKEY = 'yabbai_recovery_retry_queue';
    let queue = [];
    try { queue = JSON.parse(localStorage.getItem(QKEY) || '[]'); } catch { queue = []; }
    if (!queue.length) return;
    const remaining = [];
    for (const item of queue) {
      try {
        const r = await fetch(`${BACKEND}/api/recovery/record`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...item, token }),
        });
        if (!r.ok) remaining.push(item);
      } catch { remaining.push(item); }
    }
    localStorage.setItem(QKEY, JSON.stringify(remaining));
    if (queue.length !== remaining.length) fetchHistory();
  }, [token, fetchHistory]);

  useEffect(() => {
    fetchBalance();
    fetchHistory();
    drainRetryQueue();
    fetch(`${BACKEND}/api/recovery/config`).then(r => r.json()).then(d => {
      if (d?.feeWallet) setFeeConfig({
        feeWallet: d.feeWallet,
        feeBps: d.feeBps,
        squadsVault: d.squadsVault || null,
        feeTiers: d.feeTiers || [{label:'0.10%',bps:10},{label:'0.25%',bps:25},{label:'0.50%',bps:50}],
      });
    }).catch(() => {});
    const id = setInterval(fetchBalance, 30000);
    return () => clearInterval(id);
  }, [fetchBalance, fetchHistory, drainRetryQueue]);

  useEffect(() => {
    const s = window.solana;
    if (s?.isPhantom && s.isConnected && s.publicKey) {
      setPhantomConnected(true);
      setPhantomKey(s.publicKey.toString());
    }
  }, []);

  const connectPhantom = async () => {
    try {
      const s = window.solana;
      if (!s?.isPhantom) {
        toast.error('Phantom wallet not found');
        window.open('https://phantom.app/', '_blank');
        return;
      }
      const r = await s.connect();
      setPhantomConnected(true);
      setPhantomKey(r.publicKey.toString());
      toast.success('Phantom connected');
    } catch { toast.error('Phantom connection declined'); }
  };

  const handleExtract = async () => {
    setTxError(''); setTxSig(null);
    if (!phantomConnected || !window.solana) return toast.error('Connect Phantom first');
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) return toast.error('Enter valid amount');
    if (balance !== null && amt > balance) return toast.error(`Amount exceeds treasury balance (${balance.toFixed(4)} SOL)`);
    let destPubkey;
    try { destPubkey = new PublicKey(destination); } catch { return toast.error('Invalid destination address'); }

    const activeBps = feeBpsOverride ?? feeConfig.feeBps;
    const feeAmount = enableFee ? +(amt * activeBps / 10000).toFixed(9) : 0;
    const netAmount = amt - feeAmount;

    setTxStatus('pending');
    try {
      const connection = new Connection(RPC_URL, 'confirmed');
      const fromPubkey = window.solana.publicKey;
      const tx = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey,
          toPubkey: destPubkey,
          lamports: Math.round(netAmount * LAMPORTS_PER_SOL),
        })
      );
      if (enableFee && feeAmount > 0) {
        tx.add(SystemProgram.transfer({
          fromPubkey,
          toPubkey: new PublicKey(feeConfig.feeWallet),
          lamports: Math.round(feeAmount * LAMPORTS_PER_SOL),
        }));
      }
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
      tx.recentBlockhash = blockhash;
      tx.feePayer = fromPubkey;

      // ── Squads multi-sig mode: serialize + show, do not broadcast ──────
      if (useSquads) {
        const serialized = tx.serializeMessage();
        const b64 = btoa(String.fromCharCode(...new Uint8Array(serialized)));
        setSquadsTxB64(b64);
        setTxStatus('idle');
        toast.success('Transaction prepared for Squads — copy & submit to your vault');
        return;
      }

      const signed = await window.solana.signTransaction(tx);
      const signature = await connection.sendRawTransaction(signed.serialize(), { preflightCommitment: 'confirmed' });
      await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, 'confirmed');

      // Record on backend (with localStorage retry queue on failure)
      const record = {
        signature, amount: amt, destination,
        feeAmount, note, signer: fromPubkey.toString(),
      };
      try {
        const r = await fetch(`${BACKEND}/api/recovery/record`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...record, token }),
        });
        if (!r.ok) throw new Error('record failed');
      } catch {
        const QKEY = 'yabbai_recovery_retry_queue';
        let q = [];
        try { q = JSON.parse(localStorage.getItem(QKEY) || '[]'); } catch {}
        q.push(record);
        localStorage.setItem(QKEY, JSON.stringify(q));
      }
      fetchHistory();

      setTxSig(signature); setTxStatus('success');
      toast.success('Funds extracted successfully');
      fetchBalance();
    } catch (e) {
      setTxError(e?.message || 'Transaction failed');
      setTxStatus('error');
      toast.error(e?.message || 'Transfer failed');
    }
  };

  const quickAmount = (type) => {
    if (balance == null) return;
    if (type === 'max') setAmount((Math.max(0, balance - 0.0005)).toFixed(4));
    else if (type === 'half') setAmount((balance / 2).toFixed(4));
    else setAmount(String(type));
  };

  const reset = () => { setAmount(''); setNote(''); setTxSig(null); setTxStatus('idle'); setTxError(''); };

  const activeBps = feeBpsOverride ?? feeConfig.feeBps;
  const feePreview = enableFee && amount
    ? +(parseFloat(amount) * activeBps / 10000).toFixed(6)
    : 0;
  const netPreview = amount && enableFee
    ? Math.max(0, parseFloat(amount) - feePreview).toFixed(6)
    : amount || '0';

  return (
    <div className="page-wrap" data-testid="treasury-recovery-page">
      {/* Header */}
      <header className="page-header" style={{ marginBottom: 32 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span className="badge badge-purple">SECURE OPS</span>
          <span className="badge badge-amber">MAINNET</span>
          <span className="badge badge-green">● AUTHENTICATED</span>
          <button onClick={onLogout} className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: 11, marginLeft: 'auto' }} data-testid="recovery-logout">
            LOCK
          </button>
        </div>
        <h1 className="page-title" style={{ marginTop: 12 }} data-testid="recovery-title">Treasury Recovery</h1>
        <p className="page-subtitle">Securely extract funds from the main treasury to your secure wallet</p>
      </header>

      {/* Security warnings */}
      <div className="glass-card" style={{
        padding: 20, marginBottom: 24,
        borderColor: 'rgba(255, 176, 32, 0.4)',
        background: 'linear-gradient(180deg, rgba(255,176,32,0.06), rgba(255,176,32,0.02))',
      }} data-testid="security-warning">
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 12, letterSpacing: '0.2em', color: '#FFB020', marginBottom: 12 }}>
          ⚠ SECURITY PROTOCOL — READ BEFORE PROCEEDING
        </div>
        <ul style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: '#a8b8d0', lineHeight: 1.7, margin: 0, paddingLeft: 18 }}>
          <li>Only use this if you control the treasury private key (Phantom must be the treasury signer).</li>
          <li>This will send SOL directly from the treasury to your chosen destination wallet.</li>
          <li>Double-check the destination address before confirming — transactions are irreversible.</li>
          <li>Network fees (~0.000005 SOL) will be deducted from the signing wallet.</li>
        </ul>
      </div>

      {/* Treasury + Phantom cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16, marginBottom: 24 }}>
        <div className="glass-card" style={{ padding: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: '#3a5070', letterSpacing: '0.2em' }}>TREASURY WALLET</div>
            <a href={`https://solscan.io/account/${TREASURY}`} target="_blank" rel="noopener noreferrer"
               style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: '#9945FF', textDecoration: 'none' }} data-testid="treasury-solscan-link">
              SOLSCAN ↗
            </a>
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#7c98c4', marginTop: 6, wordBreak: 'break-all' }} data-testid="treasury-address">
            {TREASURY}
          </div>
          <div style={{ marginTop: 16, display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{ fontFamily: 'var(--font-display)', fontSize: 36, color: '#14F195', fontWeight: 800 }} data-testid="treasury-balance">
              {loading ? '—' : balance !== null ? balance.toFixed(4) : '0.0000'}
            </span>
            <span style={{ fontFamily: 'var(--font-mono)', color: '#7c98c4', fontSize: 14 }}>SOL</span>
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: '#3a5070', marginTop: 4 }}>
            Live · cached 8s · auto-refresh 30s
          </div>
        </div>

        <div className="glass-card" style={{ padding: 24 }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: '#3a5070', letterSpacing: '0.2em' }}>SIGNER (PHANTOM)</div>
          {phantomConnected ? (
            <>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#14F195', marginTop: 10, wordBreak: 'break-all' }} data-testid="phantom-pubkey">{phantomKey}</div>
              <span className="badge badge-green" style={{ marginTop: 12, display: 'inline-block' }}>● CONNECTED</span>
            </>
          ) : (
            <>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: '#7c98c4', marginTop: 10, lineHeight: 1.6 }}>
                Connect the wallet that controls the treasury to authorise an extraction.
              </div>
              <button className="btn btn-primary" style={{ marginTop: 16, width: '100%' }} onClick={connectPhantom} data-testid="connect-phantom-btn">
                CONNECT PHANTOM
              </button>
            </>
          )}
        </div>
      </div>

      {/* Extraction form */}
      {txStatus !== 'success' && (
        <div className="glass-card" style={{ padding: 28 }} data-testid="extraction-form">
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 14, letterSpacing: '0.2em', color: '#e8f0ff', marginBottom: 24 }}>
            ◆ EXTRACTION PARAMETERS
          </div>

          <label style={labelStyle}>Amount to Extract (SOL)</label>
          <input type="number" step="0.0001" min="0" placeholder="0.0000" value={amount}
            onChange={(e) => setAmount(e.target.value)} style={inputStyle} data-testid="amount-input" />
          <div style={{ display: 'flex', gap: 8, marginTop: 10, marginBottom: 20, flexWrap: 'wrap' }}>
            <button onClick={() => quickAmount('max')} style={quickBtn} data-testid="quick-max">MAX</button>
            <button onClick={() => quickAmount('half')} style={quickBtn} data-testid="quick-half">HALF</button>
            <button onClick={() => quickAmount(50)} style={quickBtn} data-testid="quick-50">50 SOL</button>
            <button onClick={() => quickAmount(100)} style={quickBtn} data-testid="quick-100">100 SOL</button>
          </div>

          <label style={labelStyle}>Destination Wallet Address</label>
          <input type="text" value={destination} onChange={(e) => setDestination(e.target.value)}
            style={{ ...inputStyle, fontFamily: 'var(--font-mono)', fontSize: 12 }} data-testid="destination-input" />
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: '#3a5070', marginTop: 6, marginBottom: 20 }}>
            Pre-filled with secure recovery wallet
          </div>

          <label style={labelStyle}>Note (optional)</label>
          <input type="text" value={note} onChange={(e) => setNote(e.target.value)}
            placeholder="Internal label for this transfer..." style={inputStyle} data-testid="note-input" />

          {/* Fee toggle + tier chips */}
          <div style={{
            marginTop: 20, padding: 14, borderRadius: 8,
            background: 'rgba(153, 69, 255, 0.06)',
            border: '1px solid rgba(153, 69, 255, 0.18)',
          }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
              <input type="checkbox" checked={enableFee} onChange={(e) => setEnableFee(e.target.checked)} data-testid="fee-toggle"
                style={{ width: 18, height: 18, accentColor: '#9945FF' }} />
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: '#e8f0ff' }}>
                Route {(activeBps / 100).toFixed(2)}% protocol fee to fee wallet
              </span>
            </label>
            {enableFee && (
              <>
                <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }} data-testid="fee-tier-chips">
                  {(feeConfig.feeTiers || []).map((t) => {
                    const isActive = (feeBpsOverride ?? feeConfig.feeBps) === t.bps;
                    return (
                      <button key={t.bps} onClick={() => setFeeBpsOverride(t.bps)}
                        data-testid={`fee-tier-${t.bps}`}
                        style={{
                          ...quickBtn,
                          background: isActive ? 'linear-gradient(135deg, rgba(153,69,255,0.4), rgba(20,241,149,0.25))' : quickBtn.background,
                          color: isActive ? '#e8f0ff' : quickBtn.color,
                          borderColor: isActive ? '#9945FF' : quickBtn.border,
                        }}>
                        {t.label}
                      </button>
                    );
                  })}
                </div>
                <div style={{ marginTop: 12, fontFamily: 'var(--font-mono)', fontSize: 11, color: '#a8b8d0', lineHeight: 1.7 }} data-testid="fee-preview">
                  <div>Fee wallet: <span style={{ color: '#b890ff', wordBreak: 'break-all' }}>{feeConfig.feeWallet}</span></div>
                  <div>Fee amount: <span style={{ color: '#FFB020' }}>{feePreview.toFixed(6)} SOL</span></div>
                  <div>Net to destination: <span style={{ color: '#14F195' }}>{netPreview} SOL</span></div>
                </div>
              </>
            )}
          </div>

          {/* Squads Multi-sig toggle */}
          <div style={{
            marginTop: 12, padding: 14, borderRadius: 8,
            background: 'rgba(20, 241, 149, 0.04)',
            border: '1px solid rgba(20, 241, 149, 0.18)',
          }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
              <input type="checkbox" checked={useSquads} onChange={(e) => { setUseSquads(e.target.checked); setSquadsTxB64(''); }} data-testid="squads-toggle"
                style={{ width: 18, height: 18, accentColor: '#14F195' }} />
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: '#e8f0ff' }}>
                Submit via Squads multi-sig (build only, do not broadcast)
              </span>
            </label>
            {useSquads && (
              <div style={{ marginTop: 10, fontFamily: 'var(--font-mono)', fontSize: 11, color: '#a8b8d0', lineHeight: 1.7 }}>
                Builds a transaction message that can be uploaded into a Squads vault for multi-signer approval.
                <input
                  type="text"
                  placeholder="Paste your Squads vault address (saved locally)"
                  value={squadsVault}
                  onChange={(e) => { setSquadsVault(e.target.value); localStorage.setItem('yabbai_squads_vault', e.target.value); }}
                  style={{ ...inputStyle, marginTop: 8, fontSize: 11 }}
                  data-testid="squads-vault-input"
                />
                {(squadsVault || feeConfig.squadsVault) && (
                  <div style={{ marginTop: 6 }}>
                    Vault: <a href={`https://app.squads.so/squads/${squadsVault || feeConfig.squadsVault}`} target="_blank" rel="noopener noreferrer" style={{ color: '#14F195', wordBreak: 'break-all' }}>{squadsVault || feeConfig.squadsVault} ↗</a>
                  </div>
                )}
              </div>
            )}
            {squadsTxB64 && (
              <div style={{
                marginTop: 12, padding: 12, borderRadius: 6,
                background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(20, 241, 149, 0.3)',
              }} data-testid="squads-tx-output">
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: '#3a5070', letterSpacing: '0.2em', marginBottom: 6 }}>
                  TRANSACTION MESSAGE (BASE64)
                </div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: '#14F195', wordBreak: 'break-all', maxHeight: 110, overflow: 'auto', marginBottom: 10 }}>
                  {squadsTxB64}
                </div>
                <button onClick={() => { navigator.clipboard.writeText(squadsTxB64); toast.success('Copied'); }}
                  className="btn btn-secondary" style={{ padding: '8px 14px', fontSize: 11 }} data-testid="copy-squads-tx">
                  COPY TO CLIPBOARD
                </button>
                {(squadsVault || feeConfig.squadsVault) && (
                  <a href={`https://app.squads.so/squads/${squadsVault || feeConfig.squadsVault}/transactions/new`} target="_blank" rel="noopener noreferrer"
                     className="btn btn-primary" style={{ padding: '8px 14px', fontSize: 11, marginLeft: 8, textDecoration: 'none' }} data-testid="open-squads-proposal">
                    CREATE SQUADS PROPOSAL ↗
                  </a>
                )}
              </div>
            )}
          </div>

          <button onClick={handleExtract}
            disabled={txStatus === 'pending' || !phantomConnected || !amount}
            className="btn btn-primary"
            style={{
              marginTop: 28, width: '100%', padding: '20px 24px', fontSize: 16, letterSpacing: '0.2em',
              background: txStatus === 'pending' ? 'rgba(153, 69, 255, 0.4)' : 'linear-gradient(135deg, #9945FF 0%, #14F195 100%)',
              border: 'none',
              cursor: (txStatus === 'pending' || !phantomConnected || !amount) ? 'not-allowed' : 'pointer',
              opacity: (txStatus === 'pending' || !phantomConnected || !amount) ? 0.5 : 1,
              boxShadow: '0 8px 32px rgba(153, 69, 255, 0.35)',
            }}
            data-testid="funnel-out-btn">
            {txStatus === 'pending'
              ? '◆ SIGNING & BROADCASTING...'
              : useSquads
                ? '◆ BUILD TX FOR SQUADS'
                : '◆ FUNNEL OUT — EXTRACT FUNDS'}
          </button>

          {txStatus === 'error' && (
            <div style={{
              marginTop: 16, padding: 12, borderRadius: 8,
              background: 'rgba(255, 60, 60, 0.08)', border: '1px solid rgba(255, 60, 60, 0.3)',
              color: '#FF6B6B', fontFamily: 'var(--font-mono)', fontSize: 12,
            }} data-testid="error-msg">
              ✕ {txError}
            </div>
          )}
        </div>
      )}

      {/* Success state */}
      {txStatus === 'success' && txSig && (
        <div className="glass-card" style={{
          padding: 36, textAlign: 'center',
          borderColor: 'rgba(20, 241, 149, 0.5)',
          background: 'linear-gradient(180deg, rgba(20,241,149,0.06), rgba(20,241,149,0.02))',
        }} data-testid="success-state">
          <div style={{ fontSize: 56, marginBottom: 16, animation: 'pulse 1.5s ease-in-out infinite' }}>✓</div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, color: '#14F195', marginBottom: 8, letterSpacing: '0.1em' }}>
            EXTRACTION COMPLETE
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: '#a8b8d0', marginBottom: 24 }}>
            Transferred {amount} SOL to destination wallet
          </div>
          <div style={{ padding: 14, borderRadius: 8, background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(20, 241, 149, 0.2)', marginBottom: 24 }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: '#3a5070', letterSpacing: '0.2em', marginBottom: 6 }}>
              TRANSACTION SIGNATURE
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#e8f0ff', wordBreak: 'break-all' }} data-testid="tx-signature">
              {txSig}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <a href={`https://solscan.io/tx/${txSig}`} target="_blank" rel="noopener noreferrer" className="btn btn-primary" style={{ textDecoration: 'none' }} data-testid="solscan-link">
              VIEW ON SOLSCAN ↗
            </a>
            <button onClick={reset} className="btn btn-secondary" data-testid="extract-more-btn">EXTRACT MORE</button>
            <Link to="/" className="btn btn-secondary" style={{ textDecoration: 'none' }} data-testid="return-command-btn">RETURN TO COMMAND</Link>
          </div>
        </div>
      )}

      {/* History */}
      {history.length > 0 && (
        <div className="glass-card" style={{ padding: 24, marginTop: 24 }} data-testid="recovery-history">
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 14, letterSpacing: '0.2em', color: '#e8f0ff', marginBottom: 16 }}>
            ◆ RECOVERY HISTORY
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {history.map((h, i) => (
              <div key={h.signature || i} style={{
                padding: 12, borderRadius: 8,
                background: 'rgba(8, 16, 36, 0.5)',
                border: '1px solid rgba(153, 69, 255, 0.12)',
                display: 'grid',
                gridTemplateColumns: 'minmax(0,2fr) 1fr 1fr',
                gap: 12,
                alignItems: 'center',
              }}>
                <a href={`https://solscan.io/tx/${h.signature}`} target="_blank" rel="noopener noreferrer"
                   style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: '#b890ff', wordBreak: 'break-all', textDecoration: 'none' }}>
                  {h.signature.slice(0, 18)}…{h.signature.slice(-8)}
                </a>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: '#14F195' }}>{h.amount} SOL</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: '#7c98c4' }}>
                  {new Date(h.createdAt).toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const labelStyle = {
  display: 'block', fontFamily: 'var(--font-mono)', fontSize: 10, color: '#7c98c4',
  letterSpacing: '0.2em', marginBottom: 8, textTransform: 'uppercase',
};
const inputStyle = {
  width: '100%', padding: '14px 16px',
  background: 'rgba(8, 16, 36, 0.6)',
  border: '1px solid rgba(153, 69, 255, 0.25)',
  borderRadius: 8, color: '#e8f0ff',
  fontFamily: 'var(--font-mono)', fontSize: 14, outline: 'none',
  transition: 'border-color 200ms ease, box-shadow 200ms ease', boxSizing: 'border-box',
};
const quickBtn = {
  padding: '8px 14px', background: 'rgba(153, 69, 255, 0.1)',
  border: '1px solid rgba(153, 69, 255, 0.3)', borderRadius: 6,
  color: '#9945FF', fontFamily: 'var(--font-mono)', fontSize: 11,
  letterSpacing: '0.1em', cursor: 'pointer', transition: 'all 200ms ease',
};
