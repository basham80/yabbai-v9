import React, { useState, useEffect } from 'react';

const BACKEND = process.env.REACT_APP_BACKEND_URL;
const TREASURY = '7dzgCA8G55VytZ8PS1b99rbbctzCgJbnEoBEYBnn15YR';

const RAIL_STATUS = [
  { id: 'sol', name: 'Solana', icon: '◎', type: 'crypto', status: 'live' },
  { id: 'phantom', name: 'Phantom Wallet', icon: 'PH', type: 'crypto', status: 'live' },
  { id: 'paypal', name: 'PayPal', icon: 'PP', type: 'fiat', status: 'not_integrated' },
  { id: 'stripe', name: 'Stripe', icon: 'ST', type: 'fiat', status: 'not_integrated' },
  { id: 'bank', name: 'Bank Transfer', icon: 'BK', type: 'fiat', status: 'not_integrated' },
  { id: 'apple', name: 'Apple Pay', icon: 'AP', type: 'fiat', status: 'not_integrated' },
  { id: 'usdc', name: 'USDC (SPL)', icon: 'USDC', type: 'stablecoin', status: 'live' },
  { id: 'eth', name: 'Ethereum', icon: 'ETH', type: 'crypto', status: 'not_integrated' },
  { id: 'coinbase', name: 'Coinbase', icon: 'CB', type: 'crypto', status: 'not_integrated' },
  { id: 'wise', name: 'Wise', icon: 'WS', type: 'fiat', status: 'not_integrated' },
  { id: 'cash', name: 'Cash App', icon: 'CA', type: 'fiat', status: 'not_integrated' },
  { id: 'cryptodc', name: 'Crypto.com', icon: 'CD', type: 'crypto', status: 'not_integrated' },
];

const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

export default function Payment() {
  const [solBalance, setSolBalance] = useState(0);
  const [usdcBalance, setUsdcBalance] = useState(0);
  const [solPriceUsd, setSolPriceUsd] = useState(0);
  const [feeRevenue, setFeeRevenue] = useState({ totalSol: 0, totalUsd: 0, count: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [balRes, priceRes, feeRes] = await Promise.all([
          fetch(`${BACKEND}/api/solana-balance?owner=${TREASURY}`).then(r => r.json()),
          fetch(`${BACKEND}/api/jupiter-price?mint=So11111111111111111111111111111111111111112`).then(r => r.json()),
          fetch(`${BACKEND}/api/fee-revenue?days=30`).then(r => r.json()),
        ]);
        if (cancelled) return;
        if (balRes.ok) {
          setSolBalance(balRes.sol || 0);
          const usdc = (balRes.tokens || []).find(t => t.mint === USDC_MINT);
          setUsdcBalance(usdc?.amount || 0);
        }
        if (priceRes.ok && priceRes.price) setSolPriceUsd(priceRes.price);
        if (feeRes.ok) setFeeRevenue({ totalSol: feeRes.totalSol || 0, totalUsd: feeRes.totalUsd || 0, count: feeRes.count || 0 });
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    const id = setInterval(load, 30000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  const solUsd = solBalance * solPriceUsd;
  const totalCryptoUsd = solUsd + usdcBalance;

  return (
    <div className="page-container fade-in">
      <p className="section-label fade-in-1">PAYMENT ENGINE</p>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 28 }}>
        <h1 className="font-display fade-in-2" style={{ fontSize: 36, fontWeight: 900, color: '#9945FF' }}>PAYMENT ENGINE</h1>
        <span className="badge badge-green" data-testid="rails-active-badge">LIVE ON CHAIN</span>
      </div>

      {/* Honest disclosure banner */}
      <div className="card fade-in-2" data-testid="payment-disclosure" style={{
        marginBottom: 24, borderColor: 'rgba(245,166,35,0.35)',
        background: 'linear-gradient(135deg, rgba(245,166,35,0.06), rgba(245,166,35,0.02))'
      }}>
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#F5A623', letterSpacing: '0.08em', marginBottom: 6 }}>● PROTOCOL TRANSPARENCY</p>
        <div style={{ fontSize: 13, color: '#e8f0ff', lineHeight: 1.5 }}>
          The only verifiable on-chain balances are the <b style={{ color: '#14F195' }}>Solana</b> and <b style={{ color: '#14F195' }}>USDC SPL</b> rails (sourced live from mainnet RPC).
          Fiat / external crypto rails are listed for roadmap visibility and show <b>NOT INTEGRATED</b>; they hold no funds in this app.
          Funds reported here are <b>not extractable from this page</b> — use <a href="/treasury-recovery" style={{ color: '#9945FF' }}>/treasury-recovery</a> (password-gated, Phantom-signed).
        </div>
      </div>

      {/* Summary */}
      <div className="grid-4 fade-in-2" style={{ marginBottom: 24 }}>
        {[
          { label: 'TREASURY SOL', value: loading ? '—' : `${solBalance.toFixed(4)} SOL`, col: '#9945FF', testid: 'stat-treasury-sol' },
          { label: 'TREASURY USDC', value: loading ? '—' : `${usdcBalance.toFixed(2)} USDC`, col: '#14F195', testid: 'stat-treasury-usdc' },
          { label: 'TREASURY USD VALUE', value: loading ? '—' : `$${totalCryptoUsd.toFixed(2)}`, col: '#e8f0ff', testid: 'stat-treasury-usd' },
          { label: 'PROTOCOL FEE (30D)', value: loading ? '—' : `$${feeRevenue.totalUsd.toFixed(2)}`, col: '#F5A623', testid: 'stat-fee-30d' },
        ].map(({ label, value, col, testid }) => (
          <div key={label} className="stat-card" data-testid={testid}>
            <div className="stat-value" style={{ background: `linear-gradient(135deg, #e8f0ff 0%, ${col} 100%)`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text', fontSize: 20 }}>{value}</div>
            <div className="stat-label">{label}</div>
          </div>
        ))}
      </div>

      {/* Rails */}
      <div className="fade-in-3" style={{ marginBottom: 24 }}>
        <p className="section-label" style={{ marginBottom: 12 }}>PAYMENT RAILS</p>
        <div className="grid-4">
          {RAIL_STATUS.map(r => {
            const isLive = r.status === 'live';
            let value = '—';
            if (isLive) {
              if (r.id === 'sol') value = loading ? '...' : `${solBalance.toFixed(4)} SOL`;
              else if (r.id === 'phantom') value = 'Connect via /wallet';
              else if (r.id === 'usdc') value = loading ? '...' : `${usdcBalance.toFixed(2)} USDC`;
            } else {
              value = 'Not integrated';
            }
            return (
              <div key={r.id} data-testid={`rail-${r.id}`} className="card" style={{
                borderColor: isLive ? 'rgba(20,241,149,0.15)' : 'rgba(58,80,112,0.25)',
                opacity: isLive ? 1 : 0.55,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#9945FF', padding: '2px 6px', border: '1px solid rgba(153,69,255,0.3)', borderRadius: 4 }}>{r.icon}</span>
                    <span style={{ fontFamily: 'var(--font-display)', fontSize: 13, color: '#e8f0ff' }}>{r.name}</span>
                  </div>
                  <span className={`badge ${isLive ? 'badge-green' : 'badge-amber'}`}>{isLive ? 'LIVE' : 'PENDING'}</span>
                </div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 700, color: isLive ? '#e8f0ff' : '#3a5070' }}>
                  {value}
                </div>
                <div className="progress-track" style={{ marginTop: 8 }}>
                  <div className="progress-fill" style={{ width: isLive ? '100%' : '0%', background: '#14F195' }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Treasury origin card */}
      <div className="card fade-in-4" data-testid="treasury-origin-card">
        <p className="section-label" style={{ marginBottom: 8 }}>TREASURY WALLET</p>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: '#e8f0ff', wordBreak: 'break-all', marginBottom: 12 }}>
          {TREASURY}
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <a className="btn btn-sm btn-outline" target="_blank" rel="noopener noreferrer" data-testid="solscan-link" href={`https://solscan.io/account/${TREASURY}`}>
            View on Solscan
          </a>
          <a className="btn btn-sm btn-primary" href="/treasury-recovery" data-testid="goto-recovery">
            Open Treasury Recovery
          </a>
        </div>
        <div className="divider" />
        <div style={{ fontSize: 11, color: '#3a5070', lineHeight: 1.5 }}>
          Protocol fee revenue from {feeRevenue.count} extractions over the last 30 days: <b style={{ color: '#14F195' }}>{feeRevenue.totalSol.toFixed(4)} SOL</b> (≈ ${feeRevenue.totalUsd.toFixed(2)}).
          All recovery operations require the Treasury Recovery password and a Phantom-signed transaction.
        </div>
      </div>
    </div>
  );
}
