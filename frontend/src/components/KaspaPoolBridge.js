import React, { useEffect, useState, useCallback } from 'react';
import toast from 'react-hot-toast';

const BACKEND = process.env.REACT_APP_BACKEND_URL;
const STORAGE_KEY = 'yabbai_kaspa_address';

/** Bridge to the v9.1 local desktop miner via WoolyPooly pool stats. */
export default function KaspaPoolBridge({ walletPubkey }) {
  const [kaspaAddr, setKaspaAddr] = useState(() => localStorage.getItem(STORAGE_KEY) || '');
  const [stats, setStats] = useState(null);
  const [payments, setPayments] = useState([]);
  const [sessions, setSessions] = useState({ items: [], summary: {} });
  const [pool, setPool] = useState(null);
  const [loading, setLoading] = useState(false);

  const isValidKaspa = kaspaAddr && kaspaAddr.startsWith('kaspa:') && kaspaAddr.length > 30;

  const fetchAll = useCallback(async () => {
    if (!isValidKaspa) return;
    setLoading(true);
    try {
      const [s, p, sess, rec] = await Promise.all([
        fetch(`${BACKEND}/api/pool/kaspa/stats?address=${encodeURIComponent(kaspaAddr)}`).then(r => r.json()),
        fetch(`${BACKEND}/api/pool/kaspa/payments?address=${encodeURIComponent(kaspaAddr)}&limit=10`).then(r => r.json()),
        fetch(`${BACKEND}/api/pool/kaspa/sessions?address=${encodeURIComponent(kaspaAddr)}&limit=20`).then(r => r.json()),
        fetch(`${BACKEND}/api/pool/kaspa/recommend`).then(r => r.json()),
      ]);
      setStats(s.ok ? s : null);
      setPayments(p.ok ? p.payments : []);
      setSessions(sess.ok ? sess : { items: [], summary: {} });
      setPool(rec.ok ? rec : null);
    } finally {
      setLoading(false);
    }
  }, [kaspaAddr, isValidKaspa]);

  useEffect(() => {
    if (!isValidKaspa) return;
    fetchAll();
    const id = setInterval(fetchAll, 30000);
    return () => clearInterval(id);
  }, [fetchAll, isValidKaspa]);

  const register = async () => {
    if (!isValidKaspa) { toast.error('Enter a valid Kaspa address (kaspa:…)'); return; }
    try {
      const r = await fetch(`${BACKEND}/api/pool/kaspa/register`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletPubkey, kaspaAddress: kaspaAddr, label: 'YabbAI Miner' }),
      });
      const d = await r.json();
      if (d.ok) {
        localStorage.setItem(STORAGE_KEY, kaspaAddr);
        toast.success('Kaspa address bound');
        fetchAll();
      } else {
        toast.error(d.detail || 'Registration failed');
      }
    } catch (e) {
      toast.error(e.message);
    }
  };

  return (
    <div className="card fade-in-3" style={{ marginBottom: 24 }} data-testid="kaspa-pool-bridge">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12, flexWrap: 'wrap' }}>
        <div>
          <p className="section-label" style={{ margin: 0 }}>REAL POOL MINING · KASPA (KAS)</p>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#7c98c4', marginTop: 4 }}>
            Bridge to <a href="/downloads/yabbai_v9_web3.zip" style={{ color: '#14F195' }}>YABBAI v9.1 desktop miner</a> via WoolyPooly
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <a href="/withdraw-kaspa" className="btn btn-sm btn-green" style={{ textDecoration: 'none' }} data-testid="withdraw-kas-link">
            WITHDRAW / SWAP KAS →
          </a>
          <button onClick={fetchAll} disabled={loading || !isValidKaspa} className="btn btn-sm btn-outline" data-testid="kaspa-refresh-btn">
            {loading ? 'SYNCING…' : 'REFRESH'}
          </button>
        </div>
      </div>

      <p style={{ fontSize: 11, color: '#7c98c4', fontFamily: 'var(--font-mono)', lineHeight: 1.5, marginBottom: 12 }}>
        ① Download the v9.1 bundle below ② Run it locally with your Kaspa wallet ③ This panel mirrors your real on-chain
        Kaspa earnings (live from WoolyPooly pool API). KAS coins payout directly to your wallet — bypasses YabbAI completely.
      </p>

      {/* Kaspa wallet input */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        <input
          type="text"
          placeholder="kaspa:qz0…"
          value={kaspaAddr}
          onChange={e => setKaspaAddr(e.target.value.trim())}
          style={{ flex: 1, minWidth: 280, padding: '10px 12px', background: 'rgba(8,16,36,0.6)', border: '1px solid rgba(20,241,149,0.25)', borderRadius: 6, color: '#e8f0ff', fontFamily: 'var(--font-mono)', fontSize: 12, outline: 'none', boxSizing: 'border-box' }}
          data-testid="kaspa-address-input"
        />
        <button onClick={register} className="btn btn-green" disabled={!isValidKaspa} data-testid="kaspa-register-btn">
          BIND ADDRESS
        </button>
      </div>

      {/* Live stats */}
      {stats?.ok && (
        <>
          <div className="grid-4" style={{ marginBottom: 14 }}>
            {[
              { l: 'POOL HASHRATE', v: `${stats.hashrateMh.toFixed(2)} MH/s`, c: '#14F195' },
              { l: 'UNPAID BALANCE', v: `${stats.balance.toFixed(4)} KAS`, c: '#9945FF' },
              { l: 'TOTAL PAID', v: `${stats.paid.toFixed(4)} KAS`, c: '#F5A623' },
              { l: 'WORKERS', v: (stats.workers || []).length.toString(), c: '#e8f0ff' },
            ].map(({ l, v, c }) => (
              <div key={l} data-testid={`kaspa-stat-${l.toLowerCase().replace(/[^a-z]/g, '')}`}>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 900, color: c }}>{v}</div>
                <div className="stat-label">{l}</div>
              </div>
            ))}
          </div>

          {payments.length > 0 && (
            <>
              <div className="divider" />
              <p className="section-label" style={{ marginBottom: 8 }}>RECENT POOL PAYOUTS</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 14 }}>
                {payments.slice(0, 5).map((p, i) => (
                  <div key={p.txid || i} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,2fr) 1fr 1fr', gap: 12, fontSize: 11, fontFamily: 'var(--font-mono)', padding: '6px 10px', borderRadius: 4, background: 'rgba(8,16,36,0.4)' }}>
                    <a href={`https://explorer.kaspa.org/txs/${p.txid}`} target="_blank" rel="noopener noreferrer" style={{ color: '#b890ff', textDecoration: 'none', wordBreak: 'break-all' }}>
                      {p.txid?.slice(0, 24) || '—'}…
                    </a>
                    <span style={{ color: '#14F195' }}>{p.amountKas.toFixed(4)} KAS</span>
                    <span style={{ color: '#7c98c4', fontSize: 10 }}>
                      {p.timestamp ? new Date(p.timestamp * 1000).toLocaleString() : ''}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}

          {sessions.summary?.reports > 0 && (
            <>
              <div className="divider" />
              <p className="section-label" style={{ marginBottom: 8 }}>LOCAL MINER SESSIONS</p>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#e8f0ff' }}>
                {sessions.summary.reports} reports · avg {((sessions.summary.avgHashrate || 0) / 1_000_000).toFixed(2)} MH/s · total {Math.round((sessions.summary.totalSec || 0) / 60)} min
              </div>
            </>
          )}
        </>
      )}

      {stats?.ok === false && (
        <div style={{ padding: 12, background: 'rgba(245,166,35,0.06)', border: '1px solid rgba(245,166,35,0.2)', borderRadius: 6, fontFamily: 'var(--font-mono)', fontSize: 11, color: '#F5A623' }}>
          ⚠ {stats.error}. Pool may not have seen this address yet — start mining first.
        </div>
      )}

      {/* Pool config */}
      {pool && (
        <details style={{ marginTop: 14 }}>
          <summary style={{ cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: 11, color: '#b890ff' }}>
            ▸ Pool URLs (paste into v9.1 miner config)
          </summary>
          <div style={{ marginTop: 8, fontFamily: 'var(--font-mono)', fontSize: 11, color: '#e8f0ff', lineHeight: 1.7 }}>
            <div>● Recommended: <code style={{ color: '#14F195' }}>{pool.recommended.url}</code></div>
            {pool.alternatives.map(p => (
              <div key={p.name}>○ {p.name}: <code style={{ color: '#9945FF' }}>{p.url}</code></div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
