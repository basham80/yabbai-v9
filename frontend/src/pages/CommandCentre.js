import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';

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
  { key: 'mcap', label: 'MCAP', fmt: (v) => `$${(v/1e6).toFixed(2)}M`, color: '#14F195' },
  { key: 'liquidity', label: 'LIQUIDITY', fmt: (v) => `$${(v/1e6).toFixed(2)}M`, color: '#9945FF' },
  { key: 'volume24h', label: '24H VOL', fmt: (v) => `$${(v/1e6).toFixed(2)}M`, color: '#14F195' },
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
    price: 0.002441,
    mcap: 2440000,
    holders: 1337,
    missions: 42,
    yield: 847.33,
    treasury: 124.7,
    apy: 847,
    txs: 12441,
  });
  const [events, setEvents] = useState([]);
  const [counter, setCounter] = useState(0);

  const genEvent = useCallback(() => {
    const template = EVENT_TEMPLATES[Math.floor(Math.random() * EVENT_TEMPLATES.length)];
    const { text, color } = template(Math.floor(Math.random() * 1000));
    const ts = new Date().toTimeString().slice(0, 8);
    return { id: Date.now() + Math.random(), ts, text, color };
  }, []);

  useEffect(() => {
    // Seed events
    setEvents(Array.from({ length: 8 }, genEvent));
  }, [genEvent]);

  useEffect(() => {
    const tick = setInterval(() => {
      setStats(prev => ({
        price: randomWiggle(prev.price, 0.02),
        mcap: randomWiggle(prev.mcap, 0.015),
        holders: prev.holders + (Math.random() > 0.7 ? 1 : 0),
        missions: prev.missions + (Math.random() > 0.85 ? 1 : 0),
        yield: prev.yield + Math.random() * 0.5,
        treasury: randomWiggle(prev.treasury, 0.005),
        apy: randomWiggle(prev.apy, 0.01),
        txs: prev.txs + Math.floor(Math.random() * 5),
      }));
      setCounter(c => c + 1);
    }, 1200);
    return () => clearInterval(tick);
  }, []);

  useEffect(() => {
    if (counter === 0) return;
    const ev = genEvent();
    setEvents(prev => [ev, ...prev].slice(0, 40));
  }, [counter, genEvent]);

  return (
    <div className="page-container fade-in">
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
              { label: 'UPTIME', value: '99.9%', color: '#14F195' },
              { label: 'AVG LATENCY', value: '47ms', color: '#9945FF' },
              { label: 'REQUESTS', value: '24,441', color: '#e8f0ff' },
              { label: 'SUCCESS RATE', value: '98.7%', color: '#14F195' },
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
