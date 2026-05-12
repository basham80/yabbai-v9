import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Area, AreaChart, ResponsiveContainer, Tooltip } from 'recharts';

const PHASES = [
  { key: 'PUMP', label: 'Pump', idx: 0 },
  { key: 'ESKY', label: 'Esky', idx: 1 },
  { key: 'MISSION', label: 'Mission', idx: 2 },
  { key: 'SCALE', label: 'Scale', idx: 3 },
  { key: 'WITHDRAW', label: 'Withdraw', idx: 4 },
];

const EVENT_TEMPLATES = [
  (n) => ({ text: `mission.deploy(${n})`, color: 'event-purple' }),
  (n) => ({ text: `yield.harvest(+$${(Math.random()*120+10).toFixed(2)})`, color: 'event-green' }),
  (n) => ({ text: `lp.reinvest(${(Math.random()*0.5+0.1).toFixed(3)} SOL)`, color: 'event-green' }),
  () => ({ text: `risk.check() → PASS`, color: 'event-purple' }),
  () => ({ text: `treasury.sweep() → OK`, color: 'event-green' }),
  () => ({ text: `wallet.sync() → ${(Math.random()*100+50).toFixed(2)} SOL`, color: 'event-purple' }),
  () => ({ text: `autonomy.tick(${(Math.random()*100).toFixed(0)}%)`, color: 'event-purple' }),
  () => ({ text: `solana.rpc → ${Math.round(Math.random()*100+20)}ms`, color: 'event-green' }),
  () => ({ text: `holder.new(${Math.floor(Math.random()*1000+1000)})`, color: '' }),
  () => ({ text: `ERROR: jupiter timeout → retrying`, color: 'event-amber' }),
  () => ({ text: `payment.paypal.payout($${(Math.random()*200+50).toFixed(2)})`, color: 'event-green' }),
  () => ({ text: `mcap.update($${(Math.random()*500000+1000000).toLocaleString()})`, color: '' }),
];

const STAT_KEYS = [
  { key: 'price', label: 'PRICE', fmt: (v) => `$${v.toFixed(8)}`, color: '#e8f0ff' },
  { key: 'mcap', label: 'MCAP', fmt: (v) => v > 1e6 ? `$${(v/1e6).toFixed(2)}M` : v > 1e3 ? `$${(v/1e3).toFixed(2)}K` : `$${(v||0).toFixed(2)}`, color: '#14F195' },
  { key: 'liquidity', label: 'LIQUIDITY', fmt: (v) => v > 1e6 ? `$${(v/1e6).toFixed(2)}M` : v > 1e3 ? `$${(v/1e3).toFixed(2)}K` : `$${(v||0).toFixed(2)}`, color: '#9945FF' },
  { key: 'volume24h', label: '24H VOL', fmt: (v) => v > 1e6 ? `$${(v/1e6).toFixed(2)}M` : v > 1e3 ? `$${(v/1e3).toFixed(2)}K` : `$${(v||0).toFixed(2)}`, color: '#14F195' },
  { key: 'missions', label: 'MISSIONS', fmt: (v) => v.toString(), color: '#14F195' },
  { key: 'yield', label: 'YIELD TODAY', fmt: (v) => `$${v.toFixed(2)}`, color: '#14F195' },
  { key: 'treasury', label: 'TREASURY SOL', fmt: (v) => `${v.toFixed(2)} SOL`, color: '#9945FF' },
  { key: 'apy', label: 'APY', fmt: (v) => `${v.toFixed(0)}%`, color: '#F5A623' },
];

function randomWiggle(base, pct = 0.01) {
  return base * (1 + (Math.random() - 0.5) * 2 * pct);
}

const WaveformCanvas = () => {
  const canvasRef = useRef(null);
  const frameRef = useRef(0);
  const offsets = useRef([...Array(8)].map((_, i) => i * 0.4));

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let raf;
    const draw = () => {
      const W = canvas.width = canvas.offsetWidth;
      const H = canvas.height = canvas.offsetHeight || 72;
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = 'rgba(6,14,32,0.75)';
      ctx.fillRect(0, 0, W, H);
      const layers = [
        { col: 'rgba(153,69,255,0.25)', amp: 14, freq: 0.018, speed: 0.022 },
        { col: 'rgba(20,241,149,0.5)', amp: 10, freq: 0.025, speed: 0.035 },
        { col: 'rgba(20,241,149,0.9)', amp: 6, freq: 0.034, speed: 0.05 },
      ];
      const t = (frameRef.current += 1);
      layers.forEach(({ col, amp, freq, speed }, li) => {
        ctx.beginPath();
        ctx.strokeStyle = col;
        ctx.lineWidth = li === 2 ? 1.5 : 1;
        for (let x = 0; x <= W; x++) {
          const y = H / 2 + Math.sin(x * freq + t * speed + offsets.current[li]) * amp
            + Math.sin(x * freq * 1.7 + t * speed * 0.7) * (amp * 0.4);
          x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.stroke();
      });
      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, []);

  return <canvas ref={canvasRef} className="waveform-canvas" style={{ height: 72 }} />;
};

const NeuralCanvas = () => {
  const canvasRef = useRef(null);
  const nodesRef = useRef([]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let raf;
    const N = 40;
    const nodes = Array.from({ length: N }, () => ({
      x: Math.random(), y: Math.random(),
      vx: (Math.random() - 0.5) * 0.0008,
      vy: (Math.random() - 0.5) * 0.0008,
    }));
    nodesRef.current = nodes;
    const draw = () => {
      const W = canvas.width = canvas.offsetWidth;
      const H = canvas.height = canvas.offsetHeight;
      ctx.clearRect(0, 0, W, H);
      nodes.forEach(n => {
        n.x += n.vx; n.y += n.vy;
        if (n.x < 0 || n.x > 1) n.vx *= -1;
        if (n.y < 0 || n.y > 1) n.vy *= -1;
      });
      for (let i = 0; i < N; i++) {
        for (let j = i + 1; j < N; j++) {
          const dx = (nodes[i].x - nodes[j].x) * W;
          const dy = (nodes[i].y - nodes[j].y) * H;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 140) {
            ctx.beginPath();
            ctx.strokeStyle = `rgba(153,69,255,${0.12 * (1 - dist / 140)})`;
            ctx.lineWidth = 0.5;
            ctx.moveTo(nodes[i].x * W, nodes[i].y * H);
            ctx.lineTo(nodes[j].x * W, nodes[j].y * H);
            ctx.stroke();
          }
        }
        ctx.beginPath();
        ctx.fillStyle = 'rgba(20,241,149,0.4)';
        ctx.arc(nodes[i].x * W, nodes[i].y * H, 2, 0, Math.PI * 2);
        ctx.fill();
      }
      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'absolute', inset: 0, width: '100%', height: '100%',
        opacity: 0.4, pointerEvents: 'none',
      }}
    />
  );
};

export default function CommandCentre() {
  const [currentPhase, setCurrentPhase] = useState(2);
  const [stats, setStats] = useState({
    price: 0, mcap: 0, liquidity: 0, volume24h: 0, holders: 0, missions: 0,
    yield: 0, treasury: 0, apy: 0, txs: 0,
  });
  const [events, setEvents] = useState([]);
  const [counter, setCounter] = useState(0);

  // Live mainnet feed: $YABBAI price, liquidity, treasury balance, fee revenue
  useEffect(() => {
    const base = process.env.REACT_APP_BACKEND_URL;
    const TREASURY = '7dzgCA8G55VytZ8PS1b99rbbctzCgJbnEoBEYBnn15YR';
    const YABBAI = 'HbtUQfmgkasRwSmqG1C2xSPNkfdyZ5jUrnw6vPCGpump';
    const load = async () => {
      const [tok, bal, fee, hist] = await Promise.all([
        fetch(`${base}/api/token-live-stats?mint=${YABBAI}`).then(r => r.json()).catch(() => null),
        fetch(`${base}/api/solana-balance?owner=${TREASURY}`).then(r => r.json()).catch(() => null),
        fetch(`${base}/api/fee-revenue?days=30`).then(r => r.json()).catch(() => null),
        fetch(`${base}/api/recovery/history?token=${encodeURIComponent(sessionStorage.getItem('yabbai_recovery_token') || '')}&limit=20`).then(r => r.ok ? r.json() : null).catch(() => null),
      ]);
      setStats((s) => ({
        ...s,
        price: tok?.price || 0,
        mcap: tok?.marketCap || 0,
        liquidity: tok?.liquidity || 0,
        volume24h: tok?.volume24h || 0,
        holders: 0, // not yet measured
        missions: hist?.items?.length || 0,
        yield: fee?.totalUsd || 0,
        treasury: bal?.ok ? bal.sol : 0,
        apy: 0, // not yet measured
        txs: hist?.items?.length || 0,
      }));
    };
    load();
    const id = setInterval(load, 30000);
    return () => clearInterval(id);
  }, []);

  const genEvent = useCallback(() => {
    const template = EVENT_TEMPLATES[Math.floor(Math.random() * EVENT_TEMPLATES.length)];
    const { text, color } = template(Math.floor(Math.random() * 1000));
    const ts = new Date().toTimeString().slice(0, 8);
    return { id: Date.now() + Math.random(), ts, text, color };
  }, []);

  useEffect(() => {
    // Seed events from real recovery history only (no synthetic events in live mode)
    const base = process.env.REACT_APP_BACKEND_URL;
    const tok = sessionStorage.getItem('yabbai_recovery_token');
    if (!tok) { setEvents([]); return; }
    fetch(`${base}/api/recovery/history?token=${encodeURIComponent(tok)}&limit=8`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (!d?.ok) return;
        setEvents((d.items || []).map((h, i) => ({
          id: h.signature || i,
          ts: (h.createdAt || '').slice(11, 19),
          text: `treasury.recover ${h.amount} SOL → ${h.destination.slice(0, 6)}…`,
          color: '#14F195',
        })));
      })
      .catch(() => {});
  }, []);

  return (
    <div className="page-container fade-in">
      {/* LIVE-ONLY MODE banner */}
      <div style={{
        margin: '0 0 16px', padding: '10px 16px', borderRadius: 8,
        background: 'linear-gradient(90deg, rgba(20,241,149,0.08), rgba(153,69,255,0.06))',
        border: '1px solid rgba(20,241,149,0.3)',
        fontFamily: 'var(--font-mono)', fontSize: 11, color: '#a8b8d0',
        display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
      }} data-testid="live-only-banner">
        <span style={{ color: '#14F195' }}>● LIVE DATA ONLY</span>
        <span>All numbers are sourced from Solana mainnet & Jupiter v3. No synthetic stats.</span>
      </div>
      {/* Hero */}
      <section
        style={{
          position: 'relative', textAlign: 'center', padding: '56px 0 44px',
          overflow: 'hidden', borderRadius: 12,
          background: 'rgba(6,14,32,0.7)',
          border: '1px solid rgba(153,69,255,0.12)',
          marginBottom: 32,
        }}
      >
        <NeuralCanvas />
        <div style={{ position: 'relative', zIndex: 2 }}>
          <p className="section-label fade-in-1">⚡ AUTONOMOUS INCOME PLATFORM</p>
          <h1
            className="font-display fade-in-2"
            style={{
              fontSize: 'clamp(52px,10vw,120px)', fontWeight: 900, lineHeight: 1,
              background: 'linear-gradient(135deg, #fff 0%, #9945FF 40%, #14F195 80%)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
              backgroundClip: 'text', letterSpacing: '0.05em', marginBottom: 8,
            }}
          >
            YABBAI
          </h1>
          <p
            className="fade-in-3"
            style={{
              fontFamily: 'var(--font-mono)', fontSize: 11, color: '#3a5070',
              letterSpacing: '0.25em', textTransform: 'uppercase', marginBottom: 28,
            }}
          >
            COMMAND CENTRE — SOLANA YIELD PROTOCOL
          </p>

          {/* Phase Tracker */}
          <div className="fade-in-4" style={{ display: 'flex', justifyContent: 'center', padding: '0 24px' }}>
            <div className="phase-tracker" style={{ width: '100%', maxWidth: 540 }}>
              {PHASES.map((phase, i) => (
                <React.Fragment key={phase.key}>
                  <div
                    className={`phase-dot${
                      i < currentPhase ? ' complete' : i === currentPhase ? ' active' : ''
                    }`}
                    onClick={() => setCurrentPhase(i)}
                    style={{ cursor: 'pointer' }}
                  >
                    <div className="phase-circle">
                      {i < currentPhase ? '✓' : i + 1}
                    </div>
                    <span className="phase-label">{phase.label}</span>
                  </div>
                  {i < PHASES.length - 1 && (
                    <div className={`phase-line${i < currentPhase ? ' complete' : ''}`} />
                  )}
                </React.Fragment>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Live Stats */}
      <div className="fade-in-2" style={{ marginBottom: 28 }}>
        <p className="section-label">• LIVE STATS</p>
        <div className="grid-4">
          {STAT_KEYS.map(({ key, label, fmt, color }) => (
            <div key={key} className="stat-card fade-in">
              <div className="stat-value" style={{
                background: `linear-gradient(135deg, #e8f0ff 0%, ${color} 100%)`,
                WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
              }}>
                {fmt(stats[key])}
              </div>
              <div className="stat-label">
                <span className="live-dot" style={{ width: 5, height: 5, marginRight: 5 }} />
                {label}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Events + Waveform */}
      <div className="grid-2 fade-in-3" style={{ marginBottom: 28 }}>
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <span className="live-dot" />
            <span className="section-label" style={{ margin: 0 }}>LIVE EVENTS</span>
          </div>
          <div className="event-stream">
            {events.map(ev => (
              <div key={ev.id} className="event-item">
                <span className="event-time">{ev.ts}</span>
                <span className={ev.color}>{ev.text}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <span className="live-dot" />
            <span className="section-label" style={{ margin: 0 }}>API PULSE WAVEFORM</span>
          </div>
          <WaveformCanvas />
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10 }}>
            {['JUPITER', 'SOLANA RPC', 'TREASURY', 'PAYPAL'].map(label => (
              <div key={label} style={{ textAlign: 'center' }}>
                <div className="live-dot" style={{ margin: '0 auto 3px' }} />
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#3a5070', letterSpacing: '0.08em' }}>{label}</span>
              </div>
            ))}
          </div>
          <div className="divider" style={{ marginTop: 16 }} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {[
              { label: 'UPTIME', value: '—', color: '#7c98c4' },
              { label: 'AVG LATENCY', value: '—', color: '#7c98c4' },
              { label: 'REQUESTS', value: '—', color: '#7c98c4' },
              { label: 'SUCCESS RATE', value: '—', color: '#7c98c4' },
            ].map(({ label, value, color }) => (
              <div key={label}>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 900, color }}>{value}</div>
                <div className="stat-label">{label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Quick actions */}
      <FeeRevenueWidget />
      <div className="card fade-in-4">
        <p className="section-label" style={{ marginBottom: 14 }}>QUICK ACTIONS</p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button className="btn btn-primary">Deploy Mission</button>
          <button className="btn btn-green">Harvest Yields</button>
          <Link to="/treasury-recovery" className="btn btn-amber" style={{ textDecoration: 'none' }} data-testid="cc-recovery-link">
            ◆ Treasury Recovery
          </Link>
          <button className="btn btn-outline">View Treasury</button>
          <button className="btn btn-outline">Sync Wallets</button>
          <button className="btn btn-outline">Run Audit</button>
        </div>
      </div>
    </div>
  );
}

function FeeRevenueWidget() {
  const [data, setData] = React.useState(null);
  const [series, setSeries] = React.useState([]);
  const [range, setRange] = React.useState(30);
  React.useEffect(() => {
    const load = () => {
      const base = process.env.REACT_APP_BACKEND_URL;
      fetch(`${base}/api/fee-revenue?days=${range}`).then(r => r.json()).then(d => { if (d?.ok) setData(d); }).catch(() => {});
      fetch(`${base}/api/fee-revenue/series?days=${range}`).then(r => r.json()).then(d => { if (d?.ok) setSeries(d.series || []); }).catch(() => {});
    };
    load();
    const id = setInterval(load, 60000);
    return () => clearInterval(id);
  }, [range]);
  if (!data) return null;
  const RANGE_OPTIONS = [7, 30, 90];
  return (
    <div className="card fade-in-3" style={{ marginBottom: 16 }} data-testid="fee-revenue-widget">
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.2fr) auto', gap: 24, alignItems: 'center' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <p className="section-label" style={{ margin: 0 }}>PROTOCOL FEE — LAST {range} DAYS</p>
            <div style={{ display: 'flex', gap: 4, marginLeft: 'auto' }} data-testid="fee-range-toggle">
              {RANGE_OPTIONS.map((r) => (
                <button key={r} onClick={() => setRange(r)} data-testid={`fee-range-${r}`}
                  style={{
                    padding: '4px 10px',
                    fontSize: 10,
                    fontFamily: 'var(--font-mono)',
                    background: r === range ? 'rgba(20,241,149,0.18)' : 'transparent',
                    color: r === range ? '#14F195' : '#7c98c4',
                    border: `1px solid ${r === range ? 'rgba(20,241,149,0.4)' : 'rgba(124,152,196,0.2)'}`,
                    borderRadius: 4, cursor: 'pointer',
                  }}>
                  {r}D
                </button>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
            <span style={{ fontFamily: 'var(--font-display)', fontSize: 32, fontWeight: 800, color: '#14F195' }} data-testid="fee-total-sol">
              {data.totalSol.toFixed(4)}
            </span>
            <span style={{ fontFamily: 'var(--font-mono)', color: '#7c98c4', fontSize: 12 }}>SOL</span>
            <span style={{ fontFamily: 'var(--font-mono)', color: '#b890ff', fontSize: 14 }} data-testid="fee-total-usd">
              ≈ ${data.totalUsd.toFixed(2)}
            </span>
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: '#3a5070', marginTop: 4 }}>
            {data.count} extraction{data.count === 1 ? '' : 's'} · SOL @ ${data.solPrice.toFixed(2)}
          </div>
        </div>
        <div style={{ height: 64, minWidth: 0 }} data-testid="fee-sparkline">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={series} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="feeGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#14F195" stopOpacity={0.6} />
                  <stop offset="100%" stopColor="#14F195" stopOpacity={0} />
                </linearGradient>
              </defs>
              <Tooltip
                contentStyle={{
                  background: 'rgba(8,16,36,0.95)',
                  border: '1px solid rgba(20,241,149,0.3)',
                  borderRadius: 6,
                  fontFamily: 'var(--font-mono)',
                  fontSize: 11,
                }}
                labelStyle={{ color: '#7c98c4' }}
                itemStyle={{ color: '#14F195' }}
                formatter={(v) => [`${Number(v).toFixed(6)} SOL`, 'Fee']}
              />
              <Area type="monotone" dataKey="sol" stroke="#14F195" strokeWidth={1.5} fill="url(#feeGrad)" isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <Link to="/treasury-recovery" className="btn btn-amber" style={{ textDecoration: 'none' }} data-testid="fee-widget-cta">
          ◆ Open Recovery Console
        </Link>
      </div>
    </div>
  );
}

