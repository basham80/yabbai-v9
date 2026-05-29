import React, { useEffect, useState, useCallback } from 'react';
import { Connection, PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL } from '@solana/web3.js';
import toast from 'react-hot-toast';

const BACKEND = process.env.REACT_APP_BACKEND_URL;
const GLORP_MINT = '6KaXDzZKzhxQYnBeL4c6b3RCrpJY5z7zsPh43aNyxtXs';
const GLORP_POOL = 'DnXJ9zXdQUzfedr4GSLDhrxMmt1QSgX4HgtWxhUYRCBK';
const RPC_URL = 'https://api.mainnet-beta.solana.com';

const TONES = [
  { id: 'degen', label: 'DEGEN' },
  { id: 'meme', label: 'MEME' },
  { id: 'community', label: 'COMMUNITY' },
  { id: 'serious', label: 'SERIOUS' },
];

export default function GrowthConsole() {
  const [overview, setOverview] = useState(null);
  const [loadingOv, setLoadingOv] = useState(true);
  const [tab, setTab] = useState('intel');
  const [readiness, setReadiness] = useState(null);

  // Marketing
  const [tone, setTone] = useState('degen');
  const [generating, setGenerating] = useState(false);
  const [marketing, setMarketing] = useState(null);

  // LP Inject
  const [lpAmount, setLpAmount] = useState('0.05');
  const [injecting, setInjecting] = useState(false);

  const fetchOverview = useCallback(async () => {
    setLoadingOv(true);
    try {
      const r = await fetch(`${BACKEND}/api/growth/overview?mint=${GLORP_MINT}`);
      const d = await r.json();
      setOverview(d);
    } finally {
      setLoadingOv(false);
    }
  }, []);

  const fetchReadiness = useCallback(async () => {
    try {
      const r = await fetch(`${BACKEND}/api/growth/listing-readiness?mint=${GLORP_MINT}`);
      const d = await r.json();
      setReadiness(d);
    } catch {}
  }, []);

  useEffect(() => {
    fetchOverview();
    fetchReadiness();
    const id = setInterval(() => { fetchOverview(); fetchReadiness(); }, 60000);
    return () => clearInterval(id);
  }, [fetchOverview, fetchReadiness]);

  const generateMarketing = async () => {
    setGenerating(true);
    try {
      const r = await fetch(`${BACKEND}/api/growth/marketing`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mint: GLORP_MINT, tone, overview }),
      });
      const d = await r.json();
      if (d.ok) {
        setMarketing(d);
        toast.success(`${tone.toUpperCase()} marketing pack ready`);
      } else {
        toast.error(d.error || 'Generation failed');
      }
    } catch (e) {
      toast.error(e.message);
    } finally {
      setGenerating(false);
    }
  };

  // Liquidity injection — sends SOL to the pool address as a goodwill add
  // (For full LP add use Raydium UI — this is the simplest Phantom-signed path
  //  that materially helps the pool without on-chain LP construction.)
  const injectLiquidity = async () => {
    if (!window.solana?.isPhantom) { toast.error('Phantom not detected'); return; }
    const amt = parseFloat(lpAmount);
    if (!amt || amt <= 0) { toast.error('Enter SOL amount > 0'); return; }
    setInjecting(true);
    try {
      const phantom = window.solana;
      if (!phantom.isConnected || !phantom.publicKey) await phantom.connect();
      const fromPubkey = phantom.publicKey;
      // For real LP add we'd use Raydium SDK — for honest UI we open Raydium's add-liquidity URL
      window.open(`https://raydium.io/liquidity/add/?pool_id=${GLORP_POOL}`, '_blank', 'noopener');
      toast.success('Opened Raydium Add-Liquidity in new tab');
    } catch (e) {
      toast.error(e?.message || 'Failed');
    } finally {
      setInjecting(false);
    }
  };

  const copy = (text) => { navigator.clipboard.writeText(text); toast.success('Copied'); };

  // Helper renders
  const lpGaugePct = overview ? Math.min(100, (overview.liquidityUsd || 0) / 50000 * 100) : 0;

  return (
    <div className="page-container fade-in">
      <p className="section-label fade-in-1">⚡ TOKEN GROWTH CONSOLE</p>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <h1 className="font-display fade-in-2" style={{ fontSize: 36, fontWeight: 900, color: '#9945FF', margin: 0 }}>
          {overview?.symbol || 'GLORP'} GROWTH
        </h1>
        <span className="badge badge-amber" data-testid="growth-status-badge">
          {readiness ? `READINESS ${readiness.readinessScore}%` : '…'}
        </span>
        <a href={`https://dexscreener.com/solana/${GLORP_POOL}`} target="_blank" rel="noopener noreferrer"
           className="btn btn-sm btn-outline" style={{ textDecoration: 'none' }} data-testid="dexscreener-link">
          DEXSCREENER ↗
        </a>
        <a href={`https://axiom.trade/meme/${GLORP_POOL}?chain=sol`} target="_blank" rel="noopener noreferrer"
           className="btn btn-sm btn-outline" style={{ textDecoration: 'none' }} data-testid="axiom-link">
          AXIOM ↗
        </a>
      </div>

      {/* Honesty banner */}
      <div className="card" style={{ marginBottom: 18, background: 'linear-gradient(135deg, rgba(245,166,35,0.04), rgba(245,166,35,0.01))', borderColor: 'rgba(245,166,35,0.22)' }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#F5A623', letterSpacing: '0.18em', marginBottom: 6 }}>● HONEST PLAYBOOK</div>
        <p style={{ fontSize: 12, color: '#e8f0ff', lineHeight: 1.55 }}>
          This console runs the real launch playbook: <b>real on-chain data → real marketing copy → real LP depth → real CEX listing criteria.</b>
          No wash trading, no fake volume — those tactics get tokens delisted in 24h. The path to "front pages" is fundamentals + community + LP depth.
        </p>
      </div>

      {/* HERO STATS */}
      <div className="grid-4 fade-in-2" style={{ marginBottom: 18 }}>
        {[
          { l: 'PRICE USD', v: overview ? `$${(overview.price || 0).toFixed(10)}` : '…', c: '#e8f0ff', tid: 'stat-price' },
          { l: '24H CHANGE', v: overview ? `${(overview.priceChange24h || 0).toFixed(2)}%` : '…',
            c: (overview?.priceChange24h || 0) >= 0 ? '#14F195' : '#ff4565', tid: 'stat-change' },
          { l: 'LIQUIDITY', v: overview ? `$${(overview.liquidityUsd || 0).toFixed(2)}` : '…', c: '#F5A623', tid: 'stat-liq' },
          { l: 'VOLUME 24H', v: overview ? `$${(overview.volume24h || 0).toFixed(2)}` : '…', c: '#9945FF', tid: 'stat-vol' },
        ].map(({ l, v, c, tid }) => (
          <div key={l} className="stat-card" data-testid={tid}>
            <div className="stat-value" style={{ background: `linear-gradient(135deg, #e8f0ff 0%, ${c} 100%)`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text', fontSize: 16 }}>{v}</div>
            <div className="stat-label">{l}</div>
          </div>
        ))}
      </div>

      {/* LP Gauge */}
      <div className="card fade-in-2" style={{ marginBottom: 18 }} data-testid="lp-gauge">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
          <p className="section-label" style={{ margin: 0 }}>LIQUIDITY → CEX READY ($50K)</p>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: '#F5A623', fontWeight: 800 }}>
            {lpGaugePct.toFixed(2)}%
          </span>
        </div>
        <div className="progress-track" style={{ height: 12 }}>
          <div className="progress-fill" style={{
            width: `${Math.max(1, lpGaugePct)}%`,
            background: 'linear-gradient(90deg, #ff4565, #F5A623, #14F195)',
          }} />
        </div>
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: '#7c98c4', marginTop: 8, lineHeight: 1.5 }}>
          ${(overview?.liquidityUsd || 0).toFixed(2)} / $50,000 — that's the floor for Coinbase Listings + the "real money pool" threshold serious buyers look for.
        </p>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, flexWrap: 'wrap' }}>
        {[
          { id: 'intel', label: '◆ INTELLIGENCE' },
          { id: 'marketing', label: '✎ AI MARKETING' },
          { id: 'liquidity', label: '◯ LIQUIDITY' },
          { id: 'listing', label: '☉ CEX LISTING PATH' },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} data-testid={`gc-tab-${t.id}`}
            className={`btn btn-sm ${tab === t.id ? 'btn-primary' : 'btn-outline'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* TAB: INTEL */}
      {tab === 'intel' && overview && (
        <div className="grid-2">
          <div className="card" data-testid="intel-holders">
            <p className="section-label" style={{ marginBottom: 12 }}>HOLDER DISTRIBUTION</p>
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 900, color: overview.top10Pct > 50 ? '#ff4565' : '#14F195' }}>
                {(overview.top10Pct || 0).toFixed(2)}%
              </div>
              <div className="stat-label">TOP-10 HOLDERS</div>
            </div>
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#7c98c4', lineHeight: 1.5 }}>
              {(overview.top10Pct || 0) > 50
                ? '⚠ Too concentrated. Buyers check this number first — they see "rug risk" above 50%.'
                : '✓ Healthy distribution. Buyers feel safer below 50%.'}
            </p>
          </div>

          <div className="card" data-testid="intel-tx">
            <p className="section-label" style={{ marginBottom: 12 }}>24H TRADES</p>
            <div style={{ display: 'flex', gap: 16 }}>
              <div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 900, color: '#14F195' }}>
                  {overview.txns24h?.buys || 0}
                </div>
                <div className="stat-label">BUYS</div>
              </div>
              <div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 900, color: '#ff4565' }}>
                  {overview.txns24h?.sells || 0}
                </div>
                <div className="stat-label">SELLS</div>
              </div>
              <div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 900, color: '#e8f0ff' }}>
                  {(overview.txns24h?.buys || 0) + (overview.txns24h?.sells || 0)}
                </div>
                <div className="stat-label">TOTAL</div>
              </div>
            </div>
          </div>

          {overview.warnings && overview.warnings.length > 0 && (
            <div className="card" style={{ gridColumn: '1 / -1', borderColor: 'rgba(255,69,101,0.25)' }} data-testid="intel-warnings">
              <p className="section-label" style={{ marginBottom: 10, color: '#ff4565' }}>WARNINGS</p>
              <ul style={{ marginLeft: 18, lineHeight: 1.7, color: '#e8f0ff', fontSize: 12 }}>
                {overview.warnings.map((w, i) => <li key={i}>{w}</li>)}
              </ul>
            </div>
          )}
          {overview.strengths && overview.strengths.length > 0 && (
            <div className="card" style={{ gridColumn: '1 / -1', borderColor: 'rgba(20,241,149,0.25)' }} data-testid="intel-strengths">
              <p className="section-label" style={{ marginBottom: 10, color: '#14F195' }}>STRENGTHS</p>
              <ul style={{ marginLeft: 18, lineHeight: 1.7, color: '#e8f0ff', fontSize: 12 }}>
                {overview.strengths.map((s, i) => <li key={i}>{s}</li>)}
              </ul>
            </div>
          )}

          <div className="card" style={{ gridColumn: '1 / -1' }} data-testid="intel-meta">
            <p className="section-label" style={{ marginBottom: 10 }}>TOKEN METADATA</p>
            <div className="grid-2" style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: '#e8f0ff' }}>
              <div>
                <div><span style={{ color: '#7c98c4' }}>Mint:</span> {GLORP_MINT.slice(0,16)}…</div>
                <div><span style={{ color: '#7c98c4' }}>Pool:</span> {GLORP_POOL.slice(0,16)}…</div>
                <div><span style={{ color: '#7c98c4' }}>DEX:</span> {overview.dex}</div>
                <div><span style={{ color: '#7c98c4' }}>Age:</span> {overview.ageDays} days</div>
              </div>
              <div>
                <div><span style={{ color: '#7c98c4' }}>FDV:</span> ${(overview.fdv || 0).toFixed(2)}</div>
                <div><span style={{ color: '#7c98c4' }}>Socials:</span> {(overview.socials || []).length}</div>
                <div><span style={{ color: '#7c98c4' }}>Websites:</span> {(overview.websites || []).length}</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB: MARKETING */}
      {tab === 'marketing' && (
        <div>
          <div className="card" style={{ marginBottom: 14 }} data-testid="marketing-controls">
            <p className="section-label" style={{ marginBottom: 10 }}>GENERATE MARKETING PACK</p>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
              {TONES.map(t => (
                <button key={t.id} onClick={() => setTone(t.id)}
                  className={`btn btn-sm ${tone === t.id ? 'btn-primary' : 'btn-outline'}`}
                  data-testid={`tone-${t.id}`}>
                  {t.label}
                </button>
              ))}
            </div>
            <button onClick={generateMarketing} disabled={generating || loadingOv} className="btn btn-green" style={{ width: '100%' }} data-testid="generate-marketing-btn">
              {generating ? '⚡ CLAUDE SONNET WORKING…' : `▸ GENERATE ${tone.toUpperCase()} MARKETING PACK`}
            </button>
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: '#7c98c4', marginTop: 8 }}>
              Outputs: 10 tweets + 3 threads + 5 telegram pitches + 1 anti-rug FUD-killer. Powered by Claude Sonnet 4.5 — uses your REAL on-chain data.
            </p>
          </div>

          {marketing?.ok && (
            <div className="card" data-testid="marketing-output">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <p className="section-label" style={{ margin: 0 }}>{tone.toUpperCase()} MARKETING PACK</p>
                <button onClick={() => copy(marketing.content)} className="btn btn-sm btn-outline">COPY ALL</button>
              </div>
              <pre style={{
                whiteSpace: 'pre-wrap', fontFamily: 'var(--font-mono)', fontSize: 12, color: '#e8f0ff',
                background: 'rgba(8,16,36,0.6)', padding: 16, borderRadius: 6,
                border: '1px solid rgba(153,69,255,0.15)', maxHeight: 600, overflow: 'auto', lineHeight: 1.6,
              }}>
                {marketing.content}
              </pre>
            </div>
          )}
        </div>
      )}

      {/* TAB: LIQUIDITY */}
      {tab === 'liquidity' && (
        <div className="grid-2">
          <div className="card" data-testid="lp-injector">
            <p className="section-label" style={{ marginBottom: 12 }}>ADD LIQUIDITY</p>
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#7c98c4', lineHeight: 1.5, marginBottom: 12 }}>
              Opens Raydium's official Add-Liquidity UI for this pool. You pair SOL + GLORP at the current ratio. <b>This is what actually pumps a token long-term</b> — deeper LP = bigger buys possible = real volume.
            </p>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
              <input type="number" step="0.001" min="0" value={lpAmount} onChange={e => setLpAmount(e.target.value)}
                style={{ flex: 1, padding: '10px 12px', background: 'rgba(8,16,36,0.6)', border: '1px solid rgba(20,241,149,0.25)', borderRadius: 6, color: '#e8f0ff', fontFamily: 'var(--font-mono)', fontSize: 12, outline: 'none', boxSizing: 'border-box' }}
                placeholder="SOL to add"
                data-testid="lp-amount-input" />
              <button onClick={injectLiquidity} disabled={injecting} className="btn btn-green" data-testid="lp-inject-btn">
                ADD LP ON RAYDIUM
              </button>
            </div>
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: '#F5A623' }}>
              Note: LP token created is YOURS — you can withdraw any time. Earn 0.25% of every swap.
            </p>
          </div>

          <div className="card" data-testid="lp-actions">
            <p className="section-label" style={{ marginBottom: 12 }}>REAL VOLUME PLAYBOOK</p>
            <ol style={{ marginLeft: 18, lineHeight: 1.8, color: '#e8f0ff', fontSize: 12 }}>
              <li>Get LP above <b style={{ color: '#14F195' }}>$1,000</b> minimum (real-buyer floor)</li>
              <li>Submit Token Info on DexScreener: X handle, Telegram, website</li>
              <li>Apply for a CoinGecko listing form ($1k+ LP + 30d age)</li>
              <li>Run AI-generated marketing on actual Twitter (manually — no auto-spam)</li>
              <li>Engage every whale that buys — they become amplifiers</li>
              <li>Lock LP via Raydium's "Burn LP" or Streamflow lockers — buyers check this</li>
              <li>Hit $50k LP + 30d organic vol → Coinbase Listings application</li>
            </ol>
          </div>
        </div>
      )}

      {/* TAB: LISTING */}
      {tab === 'listing' && readiness && (
        <div>
          <div className="card" style={{ marginBottom: 14 }}>
            <p className="section-label" style={{ marginBottom: 10 }}>READINESS SCORE</p>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 48, fontWeight: 900, color: readiness.readinessScore >= 60 ? '#14F195' : readiness.readinessScore >= 30 ? '#F5A623' : '#ff4565' }}>
                {readiness.readinessScore}%
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: '#e8f0ff' }}>
                {readiness.passed} / {readiness.total} checks passed
              </div>
            </div>
          </div>

          <div className="card" data-testid="listing-checks">
            <p className="section-label" style={{ marginBottom: 12 }}>LISTING CHECKLIST</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {readiness.checks.map((c, i) => (
                <div key={i} style={{
                  display: 'grid', gridTemplateColumns: 'minmax(0,2fr) 1fr 1fr 40px', gap: 10, alignItems: 'center',
                  padding: '10px 12px', borderRadius: 6,
                  background: c.passed ? 'rgba(20,241,149,0.05)' : 'rgba(124,152,196,0.04)',
                  border: `1px solid ${c.passed ? 'rgba(20,241,149,0.2)' : 'rgba(124,152,196,0.15)'}`,
                }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: '#e8f0ff' }}>{c.name}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#7c98c4' }}>current: {c.current}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#7c98c4' }}>need: {c.threshold}</span>
                  <span style={{ fontFamily: 'var(--font-display)', fontSize: 18, color: c.passed ? '#14F195' : '#ff4565', textAlign: 'right' }}>
                    {c.passed ? '✓' : '✗'}
                  </span>
                  {!c.passed && (
                    <div style={{ gridColumn: '1 / -1', fontFamily: 'var(--font-mono)', fontSize: 10, color: '#F5A623', paddingLeft: 8 }}>
                      → {c.hint}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
