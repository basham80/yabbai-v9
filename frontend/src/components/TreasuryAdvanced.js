import React, { useState, useEffect, useCallback } from 'react';
import { Connection, PublicKey, VersionedTransaction, Transaction } from '@solana/web3.js';
import {
  getAssociatedTokenAddressSync,
  createTransferCheckedInstruction,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountInstruction,
} from '@solana/spl-token';
import toast from 'react-hot-toast';

const BACKEND = process.env.REACT_APP_BACKEND_URL;
const RPC_URL = 'https://api.mainnet-beta.solana.com';
const INCINERATOR = '1nc1nerator11111111111111111111111111111111';

/** Decode a base64 swap transaction returned by Jupiter, sign with Phantom, send & confirm. */
async function signAndSend(connection, base64Tx) {
  if (!window.solana?.isPhantom) throw new Error('Phantom wallet not detected');
  const buf = Uint8Array.from(atob(base64Tx), c => c.charCodeAt(0));
  const tx = VersionedTransaction.deserialize(buf);
  const signed = await window.solana.signTransaction(tx);
  const sig = await connection.sendRawTransaction(signed.serialize(), { skipPreflight: false, maxRetries: 3 });
  await connection.confirmTransaction(sig, 'confirmed');
  return sig;
}

/* ── BUY & BURN ───────────────────────────────────────────────────────── */
export function BuyAndBurnPanel({ token, walletPubkey }) {
  const [yabbMint, setYabbMint] = useState('');
  const [amount, setAmount] = useState('0.01');
  const [slippage, setSlippage] = useState(100);
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState(''); // '', 'swapping', 'burning', 'done'
  const [result, setResult] = useState(null);
  const [history, setHistory] = useState([]);
  const [totals, setTotals] = useState({ totalSol: 0, count: 0 });

  // Auto-fill the configured YABB mint
  useEffect(() => {
    fetch(`${BACKEND}/api/token-mint`).then(r => r.json()).then(d => {
      if (d?.configured && d?.mint) setYabbMint(d.mint);
    }).catch(() => {});
  }, []);

  const loadHistory = useCallback(async () => {
    if (!token) return;
    try {
      const r = await fetch(`${BACKEND}/api/treasury/burn-history?token=${token}&limit=10`);
      const d = await r.json();
      if (d.ok) { setHistory(d.items || []); setTotals({ totalSol: d.totalSol, count: d.count }); }
    } catch {}
  }, [token]);
  useEffect(() => { loadHistory(); }, [loadHistory]);

  const doBurn = async () => {
    if (!walletPubkey) { toast.error('Connect Phantom first'); return; }
    if (!yabbMint || yabbMint.length < 32) { toast.error('Enter YABB mint address'); return; }
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) { toast.error('Enter SOL amount > 0'); return; }
    setBusy(true); setStage('swapping'); setResult(null);
    try {
      const connection = new Connection(RPC_URL, 'confirmed');

      // 1) Get swap tx from backend
      const swapRes = await fetch(`${BACKEND}/api/treasury/buy-and-burn`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          userPublicKey: walletPubkey,
          amountSol: amt,
          yabbMint,
          slippageBps: slippage,
        }),
      });
      const swapData = await swapRes.json();
      if (!swapData.ok) throw new Error(swapData.error || 'Swap build failed');

      // 2) Sign + send swap (SOL -> YABB into user ATA)
      const swapSig = await signAndSend(connection, swapData.swapTransaction);
      toast.success(`Swap confirmed: ${swapSig.slice(0, 8)}…`);

      // 3) Build burn tx: transferChecked from user ATA -> incinerator ATA
      setStage('burning');
      const owner = new PublicKey(walletPubkey);
      const mint = new PublicKey(yabbMint);
      const burnAddr = new PublicKey(INCINERATOR);
      const fromAta = getAssociatedTokenAddressSync(mint, owner);
      const toAta = getAssociatedTokenAddressSync(mint, burnAddr, true);

      // Get actual on-chain amount + decimals (account just funded by swap)
      const accInfo = await connection.getParsedAccountInfo(fromAta);
      const parsed = accInfo?.value?.data?.parsed?.info;
      const decimals = parsed?.tokenAmount?.decimals ?? 9;
      const rawAmount = BigInt(parsed?.tokenAmount?.amount ?? '0');
      if (rawAmount <= 0n) throw new Error('No YABB balance to burn after swap');

      const burnTx = new Transaction();
      // Create incinerator ATA if it doesn't exist (rare but possible for new mints)
      const toAccInfo = await connection.getAccountInfo(toAta);
      if (!toAccInfo) {
        burnTx.add(createAssociatedTokenAccountInstruction(owner, toAta, burnAddr, mint));
      }
      burnTx.add(createTransferCheckedInstruction(fromAta, mint, toAta, owner, rawAmount, decimals));

      const { blockhash } = await connection.getLatestBlockhash('confirmed');
      burnTx.recentBlockhash = blockhash;
      burnTx.feePayer = owner;

      const signedBurn = await window.solana.signTransaction(burnTx);
      const burnSig = await connection.sendRawTransaction(signedBurn.serialize(), { skipPreflight: false });
      await connection.confirmTransaction(burnSig, 'confirmed');

      // 4) Record
      await fetch(`${BACKEND}/api/treasury/burn-record`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          signature: burnSig,
          swapSignature: swapSig,
          yabbMint,
          amountRaw: rawAmount.toString(),
          amountSol: amt,
          signer: walletPubkey,
        }),
      }).catch(() => {});

      setStage('done');
      setResult({ swapSig, burnSig, rawAmount: rawAmount.toString(), decimals });
      toast.success('Burn complete');
      loadHistory();
    } catch (e) {
      toast.error(e.message || 'Burn failed');
      setStage('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="glass-card" style={{ padding: 24, marginTop: 24 }} data-testid="buy-burn-panel">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 16 }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 14, letterSpacing: '0.2em', color: '#e8f0ff' }}>
          ◆ BUY-AND-BURN
        </div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: '#7c98c4' }}>
          Lifetime: <b style={{ color: '#F5A623' }}>{totals.count}</b> burns · <b style={{ color: '#F5A623' }}>{totals.totalSol.toFixed(4)} SOL</b>
        </div>
      </div>

      <p style={{ fontSize: 11, color: '#7c98c4', fontFamily: 'var(--font-mono)', lineHeight: 1.6, marginBottom: 14 }}>
        Spend SOL to market-buy YABB via Jupiter, then route the entire purchased balance to the on-chain incinerator
        (<span style={{ color: '#b890ff' }}>{INCINERATOR}</span>) — permanently removing it from circulation. Phantom signs <b>two</b> transactions.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 14 }}>
        <div>
          <label style={lab}>YABB Mint</label>
          <input value={yabbMint} onChange={e => setYabbMint(e.target.value.trim())} placeholder="auto-loaded from /api/token-mint" style={inp} data-testid="burn-mint-input" />
        </div>
        <div>
          <label style={lab}>SOL Amount</label>
          <input type="number" min="0" step="0.001" value={amount} onChange={e => setAmount(e.target.value)} style={inp} data-testid="burn-amount-input" />
        </div>
        <div>
          <label style={lab}>Slippage (bps)</label>
          <input type="number" min="1" max="5000" step="10" value={slippage} onChange={e => setSlippage(parseInt(e.target.value) || 100)} style={inp} data-testid="burn-slippage-input" />
        </div>
      </div>

      <button onClick={doBurn} disabled={busy || !walletPubkey} className="btn btn-amber" style={{ width: '100%' }} data-testid="execute-burn-btn">
        {busy ? (stage === 'swapping' ? 'SWAPPING SOL → YABB…' : stage === 'burning' ? 'SENDING TO INCINERATOR…' : 'WORKING…') : 'EXECUTE BUY & BURN'}
      </button>

      {result && (
        <div style={{ marginTop: 14, padding: 12, borderRadius: 8, background: 'rgba(245,166,35,0.07)', border: '1px solid rgba(245,166,35,0.25)' }} data-testid="burn-result">
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#F5A623', marginBottom: 6 }}>● BURN COMPLETE</div>
          <div style={{ fontSize: 11, color: '#e8f0ff', fontFamily: 'var(--font-mono)', wordBreak: 'break-all' }}>
            Swap: <a href={`https://solscan.io/tx/${result.swapSig}`} target="_blank" rel="noopener noreferrer" style={{ color: '#b890ff' }}>{result.swapSig.slice(0, 32)}…</a><br/>
            Burn: <a href={`https://solscan.io/tx/${result.burnSig}`} target="_blank" rel="noopener noreferrer" style={{ color: '#b890ff' }}>{result.burnSig.slice(0, 32)}…</a>
          </div>
        </div>
      )}

      {history.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: '#7c98c4', marginBottom: 8 }}>RECENT BURNS</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {history.slice(0, 5).map((h, i) => (
              <div key={h.signature || i} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,2fr) 1fr 1fr', gap: 12, fontSize: 11, fontFamily: 'var(--font-mono)', color: '#e8f0ff', padding: '6px 10px', borderRadius: 6, background: 'rgba(8,16,36,0.5)' }}>
                <a href={`https://solscan.io/tx/${h.signature}`} target="_blank" rel="noopener noreferrer" style={{ color: '#b890ff', textDecoration: 'none' }}>
                  {h.signature?.slice(0, 18)}…
                </a>
                <span style={{ color: '#F5A623' }}>{(h.amountSol || 0).toFixed(4)} SOL</span>
                <span style={{ color: '#7c98c4', fontSize: 10 }}>{new Date(h.createdAt).toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── DUST SWEEP ──────────────────────────────────────────────────────── */
export function DustSweepPanel({ token, walletPubkey }) {
  const [threshold, setThreshold] = useState(1.0);
  const [scanning, setScanning] = useState(false);
  const [sweeping, setSweeping] = useState(false);
  const [dust, setDust] = useState([]);
  const [untradeable, setUntradeable] = useState([]);
  const [selected, setSelected] = useState({});
  const [results, setResults] = useState([]);
  const [history, setHistory] = useState({ items: [], totalOutSol: 0, count: 0 });

  const loadHistory = useCallback(async () => {
    if (!token) return;
    try {
      const r = await fetch(`${BACKEND}/api/treasury/sweep-history?token=${token}&limit=10`);
      const d = await r.json();
      if (d.ok) setHistory({ items: d.items || [], totalOutSol: d.totalOutSol, count: d.count });
    } catch {}
  }, [token]);
  useEffect(() => { loadHistory(); }, [loadHistory]);

  const doScan = async () => {
    if (!walletPubkey) { toast.error('Connect Phantom first'); return; }
    setScanning(true); setDust([]); setUntradeable([]); setSelected({}); setResults([]);
    try {
      const r = await fetch(`${BACKEND}/api/treasury/dust-scan`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, owner: walletPubkey, thresholdUsd: threshold }),
      });
      const d = await r.json();
      if (!d.ok) throw new Error(d.error || 'Scan failed');
      setDust(d.dust || []);
      setUntradeable(d.untradeable || []);
      const sel = {};
      (d.dust || []).forEach(t => { sel[t.mint] = true; });
      setSelected(sel);
      toast.success(`${d.dust?.length || 0} dust position(s) found`);
    } catch (e) {
      toast.error(e.message);
    } finally { setScanning(false); }
  };

  const doSweep = async () => {
    const mints = Object.entries(selected).filter(([, v]) => v).map(([k]) => k);
    if (!mints.length) { toast.error('Select at least one token'); return; }
    setSweeping(true); setResults([]);
    try {
      const r = await fetch(`${BACKEND}/api/treasury/dust-sweep`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, userPublicKey: walletPubkey, mints, slippageBps: 200 }),
      });
      const d = await r.json();
      if (!d.ok) throw new Error(d.error || 'Sweep build failed');

      const connection = new Connection(RPC_URL, 'confirmed');
      const swept = [];
      const out = [];
      for (const s of (d.swaps || [])) {
        if (!s.ok) { out.push({ ...s, status: 'failed' }); continue; }
        try {
          const sig = await signAndSend(connection, s.swapTransaction);
          out.push({ ...s, signature: sig, status: 'confirmed' });
          swept.push({ mint: s.mint, signature: sig, inAmount: s.inAmount, outSol: s.outSol });
          setResults([...out]); // progressive update
        } catch (err) {
          out.push({ ...s, status: 'rejected', error: err.message });
          setResults([...out]);
        }
      }
      setResults(out);
      if (swept.length) {
        await fetch(`${BACKEND}/api/treasury/sweep-record`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, owner: walletPubkey, swept }),
        }).catch(() => {});
        toast.success(`Swept ${swept.length} token(s)`);
        loadHistory();
        // refresh scan
        doScan();
      }
    } catch (e) {
      toast.error(e.message);
    } finally { setSweeping(false); }
  };

  const totalSelected = dust.filter(d => selected[d.mint]).reduce((a, d) => a + d.usdValue, 0);

  return (
    <div className="glass-card" style={{ padding: 24, marginTop: 24 }} data-testid="dust-sweep-panel">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 16 }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 14, letterSpacing: '0.2em', color: '#e8f0ff' }}>
          ◆ DUST SWEEP
        </div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: '#7c98c4' }}>
          Lifetime: <b style={{ color: '#14F195' }}>{history.count}</b> sweeps · <b style={{ color: '#14F195' }}>{history.totalOutSol.toFixed(4)} SOL</b> recovered
        </div>
      </div>

      <p style={{ fontSize: 11, color: '#7c98c4', fontFamily: 'var(--font-mono)', lineHeight: 1.6, marginBottom: 14 }}>
        Scans your connected wallet for SPL tokens worth less than the USD threshold and swaps each one to SOL via Jupiter.
        Each token requires a separate Phantom signature.
      </p>

      <div style={{ display: 'flex', gap: 12, alignItems: 'end', marginBottom: 14, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 160 }}>
          <label style={lab}>Threshold (USD)</label>
          <input type="number" step="0.5" min="0.01" value={threshold} onChange={e => setThreshold(parseFloat(e.target.value) || 1)} style={inp} data-testid="dust-threshold-input" />
        </div>
        <button onClick={doScan} disabled={scanning || !walletPubkey} className="btn btn-secondary" data-testid="dust-scan-btn">
          {scanning ? 'SCANNING…' : 'SCAN DUST'}
        </button>
        <button onClick={doSweep} disabled={sweeping || dust.length === 0 || !walletPubkey} className="btn btn-primary" data-testid="dust-sweep-btn">
          {sweeping ? 'SWEEPING…' : `SWEEP SELECTED (≈ $${totalSelected.toFixed(2)})`}
        </button>
      </div>

      {dust.length > 0 && (
        <div data-testid="dust-list" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {dust.map(t => (
            <label key={t.mint} style={{ display: 'grid', gridTemplateColumns: '24px minmax(0,1.5fr) 1fr 1fr 1fr', gap: 10, alignItems: 'center', padding: '8px 12px', borderRadius: 6, background: 'rgba(8,16,36,0.5)', border: '1px solid rgba(20,241,149,0.1)', cursor: 'pointer' }}>
              <input type="checkbox" checked={!!selected[t.mint]} onChange={e => setSelected(s => ({ ...s, [t.mint]: e.target.checked }))} data-testid={`dust-check-${t.mint.slice(0,8)}`} />
              <a href={`https://solscan.io/token/${t.mint}`} target="_blank" rel="noopener noreferrer" style={{ color: '#b890ff', fontFamily: 'var(--font-mono)', fontSize: 11, wordBreak: 'break-all', textDecoration: 'none' }}>
                {t.mint.slice(0, 12)}…{t.mint.slice(-6)}
              </a>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#e8f0ff' }}>{t.amount.toFixed(t.decimals > 4 ? 4 : t.decimals)} tokens</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#7c98c4' }}>@ ${t.price.toFixed(6)}</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#14F195', fontWeight: 700 }}>${t.usdValue.toFixed(4)}</span>
            </label>
          ))}
        </div>
      )}

      {dust.length === 0 && !scanning && (
        <div style={{ padding: 12, color: '#7c98c4', fontSize: 11, fontFamily: 'var(--font-mono)' }}>
          {walletPubkey ? 'No dust found. Click SCAN DUST to refresh.' : 'Connect Phantom to begin.'}
        </div>
      )}

      {untradeable.length > 0 && (
        <details style={{ marginTop: 12 }}>
          <summary style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: '#F5A623', cursor: 'pointer' }}>
            {untradeable.length} unpriceable token(s) skipped (no Jupiter route)
          </summary>
          <div style={{ marginTop: 8, fontSize: 10, color: '#7c98c4', fontFamily: 'var(--font-mono)' }}>
            {untradeable.map(u => (
              <div key={u.mint}>{u.mint.slice(0, 16)}… · {u.amount} tokens</div>
            ))}
          </div>
        </details>
      )}

      {results.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: '#7c98c4', marginBottom: 6 }}>SWEEP RESULTS</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {results.map((r, i) => (
              <div key={i} style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: r.status === 'confirmed' ? '#14F195' : '#F5A623' }}>
                {r.mint.slice(0, 12)}… · {r.status} · {r.outSol ? `${r.outSol.toFixed(6)} SOL` : (r.error || r.error || '-')}
                {r.signature && <> · <a href={`https://solscan.io/tx/${r.signature}`} target="_blank" rel="noopener noreferrer" style={{ color: '#b890ff' }}>tx</a></>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const lab = {
  display: 'block', fontFamily: 'var(--font-mono)', fontSize: 10, color: '#7c98c4',
  letterSpacing: '0.2em', marginBottom: 6, textTransform: 'uppercase',
};
const inp = {
  width: '100%', padding: '10px 12px',
  background: 'rgba(8, 16, 36, 0.6)',
  border: '1px solid rgba(153, 69, 255, 0.25)',
  borderRadius: 6, color: '#e8f0ff',
  fontFamily: 'var(--font-mono)', fontSize: 12, outline: 'none',
  boxSizing: 'border-box',
};
