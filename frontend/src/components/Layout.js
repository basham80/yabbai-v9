import React, { useState, useEffect, useRef } from 'react';
import { Outlet, NavLink, useLocation } from 'react-router-dom';

const NAV_LINKS = [
  { to: '/', label: 'Command', exact: true },
  { to: '/yabbai', label: 'Token' },
  { to: '/launch', label: 'Launch' },
  { to: '/mission', label: 'Mission' },
  { to: '/payment', label: 'Payment' },
  { to: '/wallet', label: 'Wallet' },
  { to: '/withdraw', label: 'Withdraw' },
  { to: '/treasury-recovery', label: 'Recovery' },
  { to: '/referrals', label: 'Referrals' },
  { to: '/pulse', label: 'API Pulse' },
  { to: '/basham', label: 'BASHAM' },
  { to: '/side-hustle', label: 'Side Hustle' },
  { to: '/promo', label: 'Promo' },
];

const TREASURY_ADDR = '7dzgCA8G55VytZ8PS1b99rbbctzCgJbnEoBEYBnn15YR';
const YABBAI_MINT = 'HbtUQfmgkasRwSmqG1C2xSPNkfdyZ5jUrnw6vPCGpump';
const SOL_MINT = 'So11111111111111111111111111111111111111112';

function useLiveTicker() {
  const [items, setItems] = useState([
    { label: 'NETWORK', value: 'MAINNET-BETA', color: '' },
  ]);
  useEffect(() => {
    const base = process.env.REACT_APP_BACKEND_URL;
    const load = async () => {
      const [solR, yabR, balR, feeR] = await Promise.all([
        fetch(`${base}/api/jupiter-price?mint=${SOL_MINT}`).then(r => r.json()).catch(() => null),
        fetch(`${base}/api/token-live-stats?mint=${YABBAI_MINT}`).then(r => r.json()).catch(() => null),
        fetch(`${base}/api/solana-balance?owner=${TREASURY_ADDR}`).then(r => r.json()).catch(() => null),
        fetch(`${base}/api/fee-revenue?days=30`).then(r => r.json()).catch(() => null),
      ]);
      const next = [];
      if (solR?.price) next.push({ label: 'SOL', value: `$${Number(solR.price).toFixed(2)}`, color: 'solana-green' });
      if (yabR?.price != null) next.push({ label: 'YABBAI', value: `$${Number(yabR.price).toExponential(2)}`, color: 'solana-purple' });
      if (yabR?.liquidity) next.push({ label: 'LIQUIDITY', value: `$${Number(yabR.liquidity).toLocaleString(undefined, { maximumFractionDigits: 0 })}`, color: 'solana-green' });
      if (balR?.ok) next.push({ label: 'TREASURY', value: `${Number(balR.sol).toFixed(4)} SOL`, color: 'solana-purple' });
      if (feeR?.ok) next.push({ label: 'FEE 30D', value: `${Number(feeR.totalSol).toFixed(4)} SOL`, color: 'solana-green' });
      next.push({ label: 'NETWORK', value: 'MAINNET-BETA', color: '' });
      setItems(next);
    };
    load();
    const id = setInterval(load, 30000);
    return () => clearInterval(id);
  }, []);
  return items;
}

export default function Layout() {
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [theme, setTheme] = useState('yabbai');

  const isBasham = location.pathname === '/basham' || location.pathname === '/side-hustle';
  const tickerItems = useLiveTicker();

  useEffect(() => {
    if (isBasham) setTheme('basham');
    else setTheme('yabbai');
  }, [location.pathname, isBasham]);

  useEffect(() => {
    if (mobileOpen) setMobileOpen(false);
  }, [location.pathname]);

  const doubled = [...tickerItems, ...tickerItems];

  return (
    <div className={`app-shell theme-${theme}`}>
      <div className="neural-bg" />
      <div className="scanline-overlay" />

      {/* Floating yabbies */}
      {[...Array(5)].map((_, i) => (
        <span
          key={i}
          className="yabby-floater"
          style={{
            left: `${10 + i * 20}%`,
            top: `${20 + i * 12}%`,
            '--dur': `${7 + i * 1.5}s`,
            '--del': `${i * 0.8}s`,
          }}
        >
          🦞
        </span>
      ))}

      {/* Ticker */}
      <div className="ticker-wrap">
        <div className="ticker-content">
          {doubled.map((item, i) => (
            <span key={i} className="ticker-segment">
              <span className="ticker-item">{item.label}</span>
              <span className={`ticker-item ${item.color}`}>{item.value}</span>
              <span className="ticker-sep">◆</span>
            </span>
          ))}
        </div>
      </div>

      {/* Nav */}
      <nav className="main-nav">
        <div className="nav-brand">
          <NavLink to="/" style={{ textDecoration: 'none' }}>
            <span className="brand-logo" data-text={theme === 'yabbai' ? 'YABBAI' : 'BASHAM'}>
              {theme === 'yabbai' ? 'YABBAI' : 'BASHAM'}
            </span>
          </NavLink>
          <span className="brand-lobster">🦞</span>
          <span
            className="live-dot"
            style={{ marginLeft: 4 }}
          />
        </div>

        <div className="desktop-nav">
          {NAV_LINKS.map(({ to, label, exact }) => (
            <NavLink
              key={to}
              to={to}
              end={exact}
              className={({ isActive }) =>
                `nav-link${isActive ? ' nav-link-active' : ''}`
              }
            >
              {label}
            </NavLink>
          ))}
        </div>

        <button
          className="nav-burger"
          onClick={() => setMobileOpen(true)}
          aria-label="Open menu"
          data-testid="nav-burger"
        >
          <span /><span /><span />
        </button>
      </nav>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="mobile-menu">
          <button
            onClick={() => setMobileOpen(false)}
            style={{
              position: 'absolute', top: 16, right: 20,
              background: 'none', border: 'none', color: '#3a5070',
              fontSize: 22, cursor: 'pointer',
            }}
          >
            ✕
          </button>
          {NAV_LINKS.map(({ to, label }) => (
            <NavLink
              key={to}
              to={to}
              className="mobile-nav-link"
              onClick={() => setMobileOpen(false)}
            >
              {label}
            </NavLink>
          ))}
        </div>
      )}

      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
}
