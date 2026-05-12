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
  { to: '/pulse', label: 'API Pulse' },
  { to: '/basham', label: 'BASHAM' },
  { to: '/side-hustle', label: 'Side Hustle' },
  { to: '/promo', label: 'Promo' },
];

const TICKER_ITEMS = [
  { label: 'SOL', value: '$178.42', color: 'solana-green' },
  { label: 'BTC', value: '$98,441', color: '' },
  { label: 'ETH', value: '$3,284', color: '' },
  { label: 'YABBAI', value: 'LIVE', color: 'solana-purple' },
  { label: 'MCAP', value: '$2.4M', color: 'solana-green' },
  { label: 'HOLDERS', value: '1,337', color: '' },
  { label: 'MISSIONS', value: '42 ACTIVE', color: 'solana-green' },
  { label: 'YIELD', value: '+$847 TODAY', color: 'solana-green' },
  { label: 'TREASURY', value: '124.7 SOL', color: 'solana-purple' },
  { label: 'APY', value: '847%', color: 'solana-green' },
  { label: 'TXS', value: '12,441 TODAY', color: '' },
  { label: 'NETWORK', value: 'MAINNET-BETA', color: '' },
];

export default function Layout() {
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [theme, setTheme] = useState('yabbai');

  const isBasham = location.pathname === '/basham' || location.pathname === '/side-hustle';

  useEffect(() => {
    if (isBasham) setTheme('basham');
    else setTheme('yabbai');
  }, [location.pathname, isBasham]);

  useEffect(() => {
    if (mobileOpen) setMobileOpen(false);
  }, [location.pathname]);

  const doubled = [...TICKER_ITEMS, ...TICKER_ITEMS];

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
