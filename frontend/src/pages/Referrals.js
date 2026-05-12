import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';

const BACKEND = process.env.REACT_APP_BACKEND_URL;

export default function Referrals() {
  const [slug, setSlug] = useState('');
  const [wallet, setWallet] = useState('');
  const [busy, setBusy] = useState(false);
  const [leaders, setLeaders] = useState([]);

  const loadLeaders = () => {
    fetch(`${BACKEND}/api/referral/leaderboard?limit=20`)
      .then(r => r.json()).then(d => setLeaders(d?.leaders || []))
      .catch(() => {});
  };
  useEffect(() => { loadLeaders(); const id = setInterval(loadLeaders, 30000); return () => clearInterval(id); }, []);

  const register = async (e) => {
    e.preventDefault(); setBusy(true);
    try {
      const r = await fetch(`${BACKEND}/api/referral/register`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: slug.toLowerCase().trim(), wallet: wallet.trim() }),
      });
      if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.detail || 'Failed'); }
      toast.success(`Slug "${slug}" registered`);
      setSlug(''); setWallet(''); loadLeaders();
    } catch (err) { toast.error(err.message); }
    finally { setBusy(false); }
  };

  return (
    <div className="page-wrap" data-testid="referrals-page">
      <header className="page-header" style={{ marginBottom: 32 }}>
        <span className="badge badge-purple">REFERRAL OPS</span>
        <h1 className="page-title" style={{ marginTop: 12 }}>Referral Console</h1>
        <p className="page-subtitle">Claim a slug, earn 20% of every protocol fee routed through your link.</p>
      </header>

      {/* Register */}
      <div className="glass-card" style={{ padding: 24, marginBottom: 24 }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 14, letterSpacing: '0.2em', color: '#e8f0ff', marginBottom: 16 }}>
          ◆ CLAIM YOUR SLUG
        </div>
        <form onSubmit={register} style={{ display: 'grid', gap: 12 }}>
          <input type="text" placeholder="slug (3-24 alphanumeric)" value={slug} onChange={(e) => setSlug(e.target.value)}
            data-testid="ref-slug-input"
            style={{ padding: '14px 16px', background: 'rgba(8,16,36,0.6)', border: '1px solid rgba(153,69,255,0.25)', borderRadius: 8, color: '#e8f0ff', fontFamily: 'var(--font-mono)' }} />
          <input type="text" placeholder="your wallet address (will receive 20% of fees)" value={wallet} onChange={(e) => setWallet(e.target.value)}
            data-testid="ref-wallet-input"
            style={{ padding: '14px 16px', background: 'rgba(8,16,36,0.6)', border: '1px solid rgba(153,69,255,0.25)', borderRadius: 8, color: '#e8f0ff', fontFamily: 'var(--font-mono)', fontSize: 12 }} />
          <button type="submit" className="btn btn-primary" disabled={busy || !slug || !wallet} data-testid="ref-register-btn">
            {busy ? 'REGISTERING...' : 'REGISTER SLUG'}
          </button>
          {slug && wallet && (
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#7c98c4' }}>
              Your share link will be: <span style={{ color: '#14F195' }}>/treasury-recovery?ref={slug.toLowerCase()}</span>
            </div>
          )}
        </form>
      </div>

      {/* Leaderboard */}
      <div className="glass-card" style={{ padding: 24 }} data-testid="ref-leaderboard">
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 14, letterSpacing: '0.2em', color: '#e8f0ff', marginBottom: 16 }}>
          ◆ TOP REFERRERS · 30 DAYS
        </div>
        {leaders.length === 0 ? (
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: '#7c98c4' }}>
            No fee revenue routed through referrals yet. Be the first.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {leaders.map((l, i) => (
              <div key={l.slug} data-testid={`ref-row-${l.slug}`}
                style={{ display: 'grid', gridTemplateColumns: '40px 1fr 1fr 100px', gap: 12, alignItems: 'center',
                  padding: 12, borderRadius: 8, background: 'rgba(8,16,36,0.5)', border: '1px solid rgba(153,69,255,0.12)' }}>
                <span style={{ fontFamily: 'var(--font-display)', color: i < 3 ? '#FFB020' : '#7c98c4', fontWeight: 800 }}>
                  #{i + 1}
                </span>
                <span style={{ fontFamily: 'var(--font-mono)', color: '#b890ff', fontSize: 13 }}>{l.slug}</span>
                <span style={{ fontFamily: 'var(--font-mono)', color: '#7c98c4', fontSize: 11, wordBreak: 'break-all' }}>
                  {l.wallet ? `${l.wallet.slice(0, 6)}…${l.wallet.slice(-4)}` : '—'}
                </span>
                <span style={{ fontFamily: 'var(--font-mono)', color: '#14F195', fontSize: 13, textAlign: 'right' }}>
                  {l.totalSol.toFixed(4)} SOL
                </span>
              </div>
            ))}
          </div>
        )}
        <Link to="/treasury-recovery" className="btn btn-secondary" style={{ marginTop: 18, textDecoration: 'none', display: 'inline-block' }}>
          ← BACK TO RECOVERY CONSOLE
        </Link>
      </div>
    </div>
  );
}
