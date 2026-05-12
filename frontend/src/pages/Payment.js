import React, { useState, useEffect } from 'react';

const PAYMENT_RAILS = [
  { id: 'paypal', name: 'PayPal', icon: '💳', type: 'fiat', status: 'live', bal: 2847.50 },
  { id: 'sol', name: 'Solana', icon: '◎', type: 'crypto', status: 'live', bal: 124.7 },
  { id: 'bank', name: 'Bank Transfer', icon: '🏦', type: 'fiat', status: 'live', bal: 15240.00 },
  { id: 'apple', name: 'Apple Pay', icon: '', type: 'fiat', status: 'live', bal: 4420.00 },
  { id: 'stripe', name: 'Stripe', icon: '💵', type: 'fiat', status: 'live', bal: 6330.00 },
  { id: 'eth', name: 'Ethereum', icon: '⧆', type: 'crypto', status: 'live', bal: 3.42 },
  { id: 'usdc', name: 'USDC', icon: '💠', type: 'stablecoin', status: 'live', bal: 18200.00 },
  { id: 'crypto', name: 'Crypto.com', icon: '🔵', type: 'crypto', status: 'sandbox', bal: 0 },
  { id: 'wise', name: 'Wise', icon: '🌍', type: 'fiat', status: 'sandbox', bal: 0 },
  { id: 'coinbase', name: 'Coinbase', icon: '🏛', type: 'crypto', status: 'live', bal: 1841.00 },
  { id: 'cash', name: 'Cash App', icon: '📱', type: 'fiat', status: 'sandbox', bal: 0 },
  { id: 'phantom', name: 'Phantom Wallet', icon: '👻', type: 'crypto', status: 'live', bal: 0.85 },
];

const LEDGER_ROWS = [
  { id: 'pp1', rail: 'PayPal', type: 'real', amount: 147.50, label: 'Affiliate yield', ts: '2025-01-15 14:22' },
  { id: 'pp2', rail: 'PayPal', type: 'real', amount: 82.00, label: 'Payout disbursed', ts: '2025-01-15 12:10' },
  { id: 's1', rail: 'Solana', type: 'real', amount: 12.7, label: 'Treasury sweep', ts: '2025-01-15 11:45' },
  { id: 'm1', rail: 'Mock', type: 'mock', amount: 999.00, label: 'Simulated LP yield', ts: '2025-01-15 10:00' },
  { id: 'm2', rail: 'Mock', type: 'mock', amount: 5000.00, label: 'Simulated arbitrage', ts: '2025-01-14 23:55' },
  { id: 'b1', rail: 'Bank', type: 'real', amount: 3500.00, label: 'Revenue deposit', ts: '2025-01-14 18:30' },
  { id: 'm3', rail: 'Mock', type: 'mock', amount: 2200.00, label: 'Mock trade P&L', ts: '2025-01-14 17:00' },
  { id: 'pp3', rail: 'PayPal', type: 'real', amount: 64.20, label: 'Commission auto-pay', ts: '2025-01-14 15:45' },
];

export default function Payment() {
  const [ppRunning, setPpRunning] = useState(false);
  const [ppTick, setPpTick] = useState(0);
  const [ledgerView, setLedgerView] = useState('both');
  const [totalProcessed, setTotalProcessed] = useState(0);
  const [rails, setRails] = useState(PAYMENT_RAILS);

  useEffect(() => {
    if (!ppRunning) return;
    const id = setInterval(() => {
      setPpTick(t => t + 1);
      setTotalProcessed(p => p + Math.random() * 50 + 10);
      setRails(prev => prev.map(r =>
        r.id === 'paypal' ? { ...r, bal: r.bal + Math.random() * 20 + 5 } : r
      ));
    }, 2000);
    return () => clearInterval(id);
  }, [ppRunning]);

  const realRows = LEDGER_ROWS.filter(r => r.type === 'real');
  const mockRows = LEDGER_ROWS.filter(r => r.type === 'mock');
  const visRows = ledgerView === 'both' ? LEDGER_ROWS : ledgerView === 'real' ? realRows : mockRows;

  return (
    <div className="page-container fade-in">
      <p className="section-label fade-in-1">⚡ PAYMENT ENGINE</p>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 28 }}>
        <h1 className="font-display fade-in-2" style={{ fontSize: 36, fontWeight: 900, color: '#9945FF' }}>PAYMENT ENGINE</h1>
        <span className="badge badge-green">12 RAILS ACTIVE</span>
      </div>

      {/* Summary */}
      <div className="grid-4 fade-in-2" style={{ marginBottom: 24 }}>
        {[
          { label: 'TOTAL REAL BALANCE', value: '$' + rails.filter(r => r.type === 'fiat').reduce((a, b) => a + b.bal, 0).toFixed(2), col: '#14F195' },
          { label: 'CRYPTO BALANCE', value: rails.filter(r => r.type !== 'fiat').map(r => r.id === 'sol' ? r.bal + ' SOL' : '').filter(Boolean)[0] || '0 SOL', col: '#9945FF' },
          { label: 'PROCESSED TODAY', value: '$' + (totalProcessed + 4823.70).toFixed(2), col: '#e8f0ff' },
          { label: 'MOCK LEDGER', value: '$7,199.00', col: '#F5A623' },
        ].map(({ label, value, col }) => (
          <div key={label} className="stat-card">
            <div className="stat-value" style={{ background: `linear-gradient(135deg, #e8f0ff 0%, ${col} 100%)`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text', fontSize: 20 }}>{value}</div>
            <div className="stat-label">{label}</div>
          </div>
        ))}
      </div>

      {/* PayPal Autopayout Engine */}
      <div className="card card-glow fade-in-3" style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div>
            <p className="section-label" style={{ marginBottom: 4 }}>PAYPAL AUTOPAYOUT ENGINE</p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {ppRunning && <span className="live-dot" />}
              <span className={ppRunning ? 'paypal-status-live' : 'paypal-status-sandbox'}>
                {ppRunning ? 'ENGINE RUNNING — LIVE' : 'ENGINE PAUSED'}
              </span>
            </div>
          </div>
          <label className="toggle-row" style={{ cursor: 'pointer' }}>
            <span className="toggle">
              <input type="checkbox" checked={ppRunning} onChange={e => setPpRunning(e.target.checked)} />
              <span className="toggle-slider" />
            </span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: ppRunning ? '#14F195' : '#3a5070' }}>AUTOPAYOUT</span>
          </label>
        </div>

        {ppRunning && (
          <div style={{ background: 'rgba(20,241,149,0.04)', border: '1px solid rgba(20,241,149,0.15)', borderRadius: 6, padding: '12px 16px', marginBottom: 14 }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: '#14F195', marginBottom: 6 }}>
              ► AUTOPAYOUT ACTIVE — CYCLE #{ppTick}
            </div>
            <div style={{ display: 'flex', gap: 24 }}>
              {[
                { l: 'PAYOUTS SENT', v: ppTick.toString() },
                { l: 'AVG AMOUNT', v: `$${(totalProcessed / Math.max(ppTick, 1)).toFixed(2)}` },
                { l: 'TOTAL DISBURSED', v: `$${totalProcessed.toFixed(2)}` },
              ].map(({ l, v }) => (
                <div key={l}>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 700, color: '#e8f0ff' }}>{v}</div>
                  <div className="stat-label">{l}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="grid-3">
          {[
            { l: 'THRESHOLD', v: '$25.00', c: '#3a5070' },
            { l: 'INTERVAL', v: '24hrs', c: '#3a5070' },
            { l: 'DESTINATION', v: 'PayPal Business', c: '#9945FF' },
          ].map(({ l, v, c }) => (
            <div key={l}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 700, color: c }}>{v}</div>
              <div className="stat-label">{l}</div>
            </div>
          ))}
        </div>
      </div>

      {/* 12 Rails */}
      <div className="fade-in-3" style={{ marginBottom: 24 }}>
        <p className="section-label" style={{ marginBottom: 12 }}>PAYMENT RAILS</p>
        <div className="grid-4">
          {rails.map(r => (
            <div key={r.id} className="card" style={{ borderColor: r.status === 'live' ? 'rgba(20,241,149,0.15)' : 'rgba(245,166,35,0.12)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 18 }}>{r.icon}</span>
                  <span style={{ fontFamily: 'var(--font-display)', fontSize: 13, color: '#e8f0ff' }}>{r.name}</span>
                </div>
                <span className={`badge ${r.status === 'live' ? 'badge-green' : 'badge-amber'}`}>{r.status}</span>
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 15, fontWeight: 700, color: r.status === 'live' ? '#e8f0ff' : '#3a5070' }}>
                {r.type === 'crypto' ? `${r.bal} ${r.name.split(' ')[0].toUpperCase()}` : `$${r.bal.toFixed(2)}`}
              </div>
              <div className="progress-track" style={{ marginTop: 8 }}>
                <div className="progress-fill" style={{ width: r.status === 'live' ? '100%' : '30%', background: r.status === 'live' ? '#14F195' : '#F5A623' }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Real vs Mock Ledger */}
      <div className="card fade-in-4">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <p className="section-label" style={{ margin: 0 }}>REAL vs MOCK LEDGER</p>
          <div style={{ display: 'flex', gap: 6 }}>
            {['both', 'real', 'mock'].map(v => (
              <button
                key={v}
                className={`btn btn-sm ${ledgerView === v ? 'btn-primary' : 'btn-outline'}`}
                onClick={() => setLedgerView(v)}
              >{v.toUpperCase()}</button>
            ))}
          </div>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--font-mono)', fontSize: 11 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(153,69,255,0.15)' }}>
                {['RAIL', 'TYPE', 'AMOUNT', 'LABEL', 'TIMESTAMP'].map(h => (
                  <th key={h} style={{ padding: '8px 12px', textAlign: 'left', color: '#3a5070', letterSpacing: '0.1em', fontWeight: 700 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visRows.map(r => (
                <tr key={r.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                  <td style={{ padding: '8px 12px', color: '#e8f0ff' }}>{r.rail}</td>
                  <td style={{ padding: '8px 12px' }}>
                    <span className={`badge ${r.type === 'real' ? 'badge-green' : 'badge-amber'}`}>{r.type}</span>
                  </td>
                  <td style={{ padding: '8px 12px', color: r.type === 'real' ? '#14F195' : '#F5A623', fontWeight: 700 }}>
                    +${r.amount.toFixed(2)}
                  </td>
                  <td style={{ padding: '8px 12px', color: '#3a5070' }}>{r.label}</td>
                  <td style={{ padding: '8px 12px', color: '#3a5070', fontSize: 10 }}>{r.ts}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="divider" />
        <div style={{ display: 'flex', gap: 24 }}>
          <div>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 16, fontWeight: 900, color: '#14F195' }}>
              ${realRows.reduce((a, r) => a + r.amount, 0).toFixed(2)}
            </span>
            <div className="stat-label">REAL TOTAL</div>
          </div>
          <div>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 16, fontWeight: 900, color: '#F5A623' }}>
              ${mockRows.reduce((a, r) => a + r.amount, 0).toFixed(2)}
            </span>
            <div className="stat-label">MOCK TOTAL (EXCLUDED)</div>
          </div>
        </div>
      </div>
    </div>
  );
}
