import React, { useState, useEffect, useRef } from 'react';

const TEMPLATES = [
  { id: 't1', name: 'Cyberpunk Banner', aspect: '1200x630', type: 'social' },
  { id: 't2', name: 'Token Launch Card', aspect: '1080x1080', type: 'social' },
  { id: 't3', name: 'YABBAI Hero', aspect: '1920x1080', type: 'web' },
  { id: 't4', name: 'BASHAM Gold Card', aspect: '800x500', type: 'print' },
  { id: 't5', name: 'Mission Report', aspect: '1200x800', type: 'report' },
];

const COPY_LINES = [
  'YABBAI — Autonomous Yield on Solana',
  '⚡ Mission active. Yields accumulating.',
  'Join 1,337 holders earning passive income',
  '847% APY — AI-powered treasury management',
  'BASHAM: The business wealth protocol',
  'From Side Hustle to Autonomous Income Machine',
];

const PromoCanvas = ({ template, headline, subline, theme, animating }) => {
  const canvasRef = useRef(null);
  const animRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const [W, H] = (template?.aspect || '1200x630').split('x').map(Number);
    const scale = Math.min(canvas.offsetWidth / W, canvas.offsetHeight / H);
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetWidth * (H / W);
    const CW = canvas.width;
    const CH = canvas.height;
    let raf;
    const isGold = theme === 'basham';
    const draw = (t) => {
      ctx.fillStyle = isGold ? '#0a0a08' : '#060e20';
      ctx.fillRect(0, 0, CW, CH);
      // Grid
      ctx.strokeStyle = isGold ? 'rgba(212,160,23,0.05)' : 'rgba(153,69,255,0.05)';
      ctx.lineWidth = 1;
      for (let x = 0; x < CW; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, CH); ctx.stroke(); }
      for (let y = 0; y < CH; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(CW, y); ctx.stroke(); }
      // Radial
      const grad = ctx.createRadialGradient(CW * 0.3, CH * 0.5, 0, CW * 0.3, CH * 0.5, CW * 0.6);
      grad.addColorStop(0, isGold ? 'rgba(212,160,23,0.15)' : 'rgba(153,69,255,0.15)');
      grad.addColorStop(1, 'transparent');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, CW, CH);
      // Border
      ctx.strokeStyle = isGold ? 'rgba(212,160,23,0.6)' : 'rgba(153,69,255,0.6)';
      ctx.lineWidth = 2;
      ctx.strokeRect(10, 10, CW - 20, CH - 20);
      // Corner accents
      const accentColor = isGold ? '#d4a017' : '#9945FF';
      ctx.strokeStyle = accentColor;
      ctx.lineWidth = 3;
      [0, 1, 2, 3].forEach(corner => {
        const cx = corner % 2 === 0 ? 10 : CW - 10;
        const cy = corner < 2 ? 10 : CH - 10;
        const dx = corner % 2 === 0 ? 1 : -1;
        const dy = corner < 2 ? 1 : -1;
        ctx.beginPath(); ctx.moveTo(cx, cy + dy * 25); ctx.lineTo(cx, cy); ctx.lineTo(cx + dx * 25, cy); ctx.stroke();
      });
      // Waveform line
      ctx.beginPath();
      ctx.strokeStyle = isGold ? 'rgba(212,160,23,0.4)' : 'rgba(20,241,149,0.4)';
      ctx.lineWidth = 1.5;
      for (let x = 0; x <= CW; x += 2) {
        const y = CH * 0.78 + Math.sin(x * 0.03 + t * 0.05) * 10 + Math.sin(x * 0.07 + t * 0.03) * 5;
        x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke();
      // Headline
      const fs = Math.max(22, Math.min(42, CW * 0.055));
      ctx.fillStyle = '#ffffff';
      ctx.font = `900 ${fs}px Unbounded, sans-serif`;
      ctx.textAlign = 'left';
      ctx.fillText(headline || 'YABBAI', 40, CH * 0.42);
      // Subline
      if (subline) {
        ctx.fillStyle = isGold ? '#d4a017' : '#14F195';
        ctx.font = `500 ${Math.max(12, fs * 0.45)}px JetBrains Mono, monospace`;
        ctx.fillText(subline, 40, CH * 0.56);
      }
      // Brand
      ctx.fillStyle = isGold ? 'rgba(212,160,23,0.4)' : 'rgba(153,69,255,0.4)';
      ctx.font = `700 ${Math.max(10, fs * 0.3)}px Unbounded, sans-serif`;
      ctx.textAlign = 'right';
      ctx.fillText(isGold ? 'BASHAM' : 'YABBAI', CW - 30, CH - 25);
      ctx.textAlign = 'left';
      if (animating) raf = requestAnimationFrame(() => draw(t + 1));
    };
    draw(0);
    return () => { if (raf) cancelAnimationFrame(raf); };
  }, [template, headline, subline, theme, animating]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: '100%', borderRadius: 8, border: '1px solid rgba(153,69,255,0.2)' }}
    />
  );
};

export default function Promo() {
  const [selectedTemplate, setSelectedTemplate] = useState(TEMPLATES[0]);
  const [headline, setHeadline] = useState('YABBAI');
  const [subline, setSubline] = useState(COPY_LINES[0]);
  const [theme, setTheme] = useState('yabbai');
  const [animating, setAnimating] = useState(true);
  const [generated, setGenerated] = useState([]);

  const handleGenerate = () => {
    const entry = {
      id: Date.now(),
      template: selectedTemplate.name,
      headline,
      subline,
      ts: new Date().toLocaleTimeString(),
    };
    setGenerated(prev => [entry, ...prev].slice(0, 6));
  };

  return (
    <div className="page-container fade-in">
      <p className="section-label fade-in-1">⚡ PROMO GENERATOR</p>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 28 }}>
        <h1 className="font-display fade-in-2" style={{ fontSize: 36, fontWeight: 900, color: '#9945FF' }}>PROMO GENERATOR</h1>
        <span className="badge badge-purple">CANVAS ENGINE</span>
      </div>

      <div className="grid-2 fade-in-2" style={{ marginBottom: 24 }}>
        {/* Controls */}
        <div className="card">
          <p className="section-label" style={{ marginBottom: 14 }}>CONFIGURE</p>

          <div style={{ marginBottom: 14 }}>
            <label className="stat-label" style={{ display: 'block', marginBottom: 5 }}>TEMPLATE</label>
            <select className="field" value={selectedTemplate.id} onChange={e => setSelectedTemplate(TEMPLATES.find(t => t.id === e.target.value))}>
              {TEMPLATES.map(t => <option key={t.id} value={t.id}>{t.name} ({t.aspect})</option>)}
            </select>
          </div>

          <div style={{ marginBottom: 14 }}>
            <label className="stat-label" style={{ display: 'block', marginBottom: 5 }}>THEME</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {['yabbai', 'basham'].map(t => (
                <button key={t} className={`btn btn-sm ${theme === t ? 'btn-primary' : 'btn-outline'}`} onClick={() => setTheme(t)}>
                  {t.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          <div style={{ marginBottom: 14 }}>
            <label className="stat-label" style={{ display: 'block', marginBottom: 5 }}>HEADLINE</label>
            <input className="field" value={headline} onChange={e => setHeadline(e.target.value)} placeholder="YABBAI" />
          </div>

          <div style={{ marginBottom: 14 }}>
            <label className="stat-label" style={{ display: 'block', marginBottom: 5 }}>COPY LINE</label>
            <select className="field" value={subline} onChange={e => setSubline(e.target.value)}>
              {COPY_LINES.map(c => <option key={c}>{c}</option>)}
            </select>
          </div>

          <label className="toggle-row" style={{ cursor: 'pointer', marginBottom: 16 }}>
            <span className="toggle">
              <input type="checkbox" checked={animating} onChange={e => setAnimating(e.target.checked)} />
              <span className="toggle-slider" />
            </span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: animating ? '#9945FF' : '#3a5070' }}>Live Animation</span>
          </label>

          <button className="btn btn-primary" style={{ width: '100%' }} onClick={handleGenerate} data-testid="generate-promo-btn">
            ⚡ GENERATE PROMO
          </button>
        </div>

        {/* Canvas preview */}
        <div className="card">
          <p className="section-label" style={{ marginBottom: 12 }}>PREVIEW — {selectedTemplate.aspect}</p>
          <PromoCanvas template={selectedTemplate} headline={headline} subline={subline} theme={theme} animating={animating} />
          <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
            <button className="btn btn-green btn-sm">Export PNG</button>
            <button className="btn btn-outline btn-sm">Copy SVG</button>
          </div>
        </div>
      </div>

      {/* Generated history */}
      {generated.length > 0 && (
        <div className="card fade-in">
          <p className="section-label" style={{ marginBottom: 12 }}>GENERATED PROMOS</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {generated.map(g => (
              <div key={g.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', border: '1px solid rgba(153,69,255,0.1)', borderRadius: 6 }}>
                <div>
                  <span style={{ fontFamily: 'var(--font-display)', fontSize: 12, color: '#e8f0ff' }}>{g.headline}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: '#3a5070', marginLeft: 8 }}>{g.template}</span>
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#3a5070' }}>{g.ts}</span>
                  <button className="btn btn-outline btn-sm">Export</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
