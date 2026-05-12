import React, { useState, useEffect, useRef, useCallback } from 'react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const OHLCV_CANDLES = 60;
function genCandle(prev, i) {
  const open = prev ? prev.close : 0.002441;
  const change = (Math.random() - 0.46) * open * 0.035;
  const close = Math.max(open + change, 0.0000001);
  const high = Math.max(open, close) * (1 + Math.random() * 0.015);
  const low = Math.min(open, close) * (1 - Math.random() * 0.015);
  const vol = Math.random() * 80000 + 10000;
  const ts = Date.now() - (OHLCV_CANDLES - i) * 300000;
  return { open, close, high, low, vol, ts };
}
function seedCandles() {
  const candles = [];
  for (let i = 0; i < OHLCV_CANDLES; i++) candles.push(genCandle(candles[i - 1], i));
  return candles;
}

const ChartCanvas = ({ candles }) => {
  const canvasRef = useRef(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !candles.length) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width = canvas.offsetWidth;
    const H = canvas.height = canvas.offsetHeight || 220;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(6,14,32,0.85)';
    ctx.fillRect(0, 0, W, H);

    const prices = candles.map(c => c.close);
    const minP = Math.min(...prices) * 0.995;
    const maxP = Math.max(...prices) * 1.005;
    const toY = p => H - ((p - minP) / (maxP - minP)) * (H - 20) - 10;

    // Gradient fill
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, 'rgba(20,241,149,0.2)');
    grad.addColorStop(1, 'rgba(20,241,149,0)');
    ctx.beginPath();
    candles.forEach((c, i) => {
      const x = (i / (candles.length - 1)) * W;
      i === 0 ? ctx.moveTo(x, toY(c.close)) : ctx.lineTo(x, toY(c.close));
    });
    ctx.lineTo(W, H);
    ctx.lineTo(0, H);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    // Line
    ctx.beginPath();
    ctx.strokeStyle = '#14F195';
    ctx.lineWidth = 2;
    ctx.shadowColor = '#14F195';
    ctx.shadowBlur = 10;
    candles.forEach((c, i) => {
      const x = (i / (candles.length - 1)) * W;
      i === 0 ? ctx.moveTo(x, toY(c.close)) : ctx.lineTo(x, toY(c.close));
    });
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Price label
    const last = candles[candles.length - 1];
    const lastX = W;
    const lastY = toY(last.close);
    ctx.fillStyle = 'rgba(20,241,149,0.9)';
    ctx.font = '600 10px JetBrains Mono';
    ctx.fillText(`$${last.close.toFixed(6)}`, lastX - 80, lastY - 5);
  }, [candles]);

  return <canvas ref={canvasRef} style={{ width: '100%', height: 220, borderRadius: 6 }} />;
};

export default function YabbaiApp() {
  const [candles, setCandles] = useState(seedCandles);
  const [price, setPrice] = useState(null);
  const [mintCfg, setMintCfg] = useState(null);
  const [swapFrom, setSwapFrom] = useState('USDC');
  const [swapAmt, setSwapAmt] = useState('');
  const [sweeping, setSweeping] = useState(false);
  const [sweepDone, setSweepDone] = useState(false);
  const [slippage, setSlippage] = useState(0.5);
  const [aiConfig, setAiConfig] = useState({ autonomy: 75, risk: 40, reinvest: 60 });
  const [toggles, setToggles] = useState({ selfImprove: true, autoReinvest: true });
  const mintRef = useRef(null);

  useEffect(() => {
    fetch(`${API}/token-mint`)
      .then(r => r.json())
      .then(d => { if (d.configured) { setMintCfg(d); mintRef.current = d.mint; } })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!mintRef.current) return;
    const poll = () => {
      fetch(`${API}/jupiter-price?mint=${mintRef.current}`)
        .then(r => r.json())
        .then(d => { if (d.ok && d.price) setPrice(d.price); })
        .catch(() => {});
    };
    poll();
    const id = setInterval(poll, 15000);
    return () => clearInterval(id);
  }, [mintCfg]);

  useEffect(() => {
    const tick = setInterval(() => {
      setCandles(prev => {
        const last = prev[prev.length - 1];
        const next = genCandle(last, prev.length);
        return [...prev.slice(-OHLCV_CANDLES + 1), next];
      });
    }, 5000);
    return () => clearInterval(tick);
  }, []);

  const handleSweep = async () => {
    setSweeping(true);
    await new Promise(r => setTimeout(r, 1800));
    setSweeping(false);
    setSweepDone(true);
    setTimeout(() => setSweepDone(false), 3000);
  };

  const currentPrice = price ?? candles[candles.length - 1]?.close ?? 0.002441;
  const swapOut = swapAmt ? (parseFloat(swapAmt) / currentPrice).toFixed(2) : '';

  return (
    <div className="page-container fade-in">
      <div style={{ marginBottom: 24 }}>
        <p className="section-label fade-in-1">⚡ YABBAI TOKEN</p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <h1 className="font-display fade-in-2" style={{ fontSize: 36, fontWeight: 900, color: '#9945FF' }}>YABBAI</h1>
          <span className="badge badge-green fade-in-2">LIVE</span>
          {mintCfg && <span className="badge badge-purple fade-in-2">{mintCfg.network}</span>}
        </div>
        <div className="font-mono fade-in-3" style={{ fontSize: 32, fontWeight: 900, color: '#14F195', marginTop: 4 }}>
          ${currentPrice.toFixed(6)}
          <span style={{ fontSize: 12, color: '#3a5070', marginLeft: 10 }}>USDC</span>
        </div>
      </div>

      <div className="grid-2 fade-in-2" style={{ marginBottom: 24 }}>
        {/* Chart */}
        <div className="card card-green-glow" style={{ gridColumn: '1 / -1' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <span className="section-label" style={{ margin: 0 }}>OHLCV CHART</span>
            <div style={{ display: 'flex', gap: 6 }}>
              {['5m', '15m', '1h', '4h'].map(tf => (
                <button key={tf} className="btn btn-outline btn-sm">{tf}</button>
              ))}
            </div>
          </div>
          <ChartCanvas candles={candles} />
          <div className="grid-4" style={{ marginTop: 14 }}>
            {[
              { l: 'OPEN', v: `$${candles[candles.length-1]?.open.toFixed(6)}` },
              { l: 'HIGH', v: `$${candles[candles.length-1]?.high.toFixed(6)}` },
              { l: 'LOW', v: `$${candles[candles.length-1]?.low.toFixed(6)}` },
              { l: 'VOLUME', v: candles[candles.length-1]?.vol.toLocaleString(undefined, { maximumFractionDigits: 0 }) },
            ].map(({ l, v }) => (
              <div key={l}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 700, color: '#e8f0ff' }}>{v}</div>
                <div className="stat-label">{l}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid-2 fade-in-3" style={{ marginBottom: 24 }}>
        {/* Jupiter Swap */}
        <div className="card">
          <p className="section-label" style={{ marginBottom: 14 }}>JUPITER SWAP</p>
          <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
            {['USDC → YABBAI', 'YABBAI → USDC'].map(label => (
              <button
                key={label}
                className={`btn btn-sm ${swapFrom === label.split(' ')[0] ? 'btn-primary' : 'btn-outline'}`}
                onClick={() => setSwapFrom(label.split(' ')[0])}
              >{label}</button>
            ))}
          </div>
          <div style={{ marginBottom: 10 }}>
            <label className="stat-label" style={{ display: 'block', marginBottom: 5 }}>YOU PAY</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                className="field"
                placeholder="0.00"
                value={swapAmt}
                onChange={e => setSwapAmt(e.target.value)}
                type="number"
              />
              <span className="badge badge-purple" style={{ alignSelf: 'center', whiteSpace: 'nowrap' }}>
                {swapFrom}
              </span>
            </div>
          </div>
          <div style={{ marginBottom: 14 }}>
            <label className="stat-label" style={{ display: 'block', marginBottom: 5 }}>YOU RECEIVE</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input className="field" value={swapOut} readOnly placeholder="0.00" />
              <span className="badge badge-green" style={{ alignSelf: 'center', whiteSpace: 'nowrap' }}>
                {swapFrom === 'USDC' ? 'YABBAI' : 'USDC'}
              </span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 14 }}>
            <span className="stat-label">SLIPPAGE</span>
            {[0.1, 0.5, 1.0].map(s => (
              <button
                key={s}
                className={`btn btn-sm ${slippage === s ? 'btn-primary' : 'btn-outline'}`}
                onClick={() => setSlippage(s)}
              >{s}%</button>
            ))}
          </div>
          <button className="btn btn-green" style={{ width: '100%' }}>Swap via Jupiter</button>
          <div style={{ marginTop: 10, fontFamily: 'var(--font-mono)', fontSize: 10, color: '#3a5070' }}>
            Rate: 1 USDC = {(1 / currentPrice).toFixed(2)} YABBAI • Fee: 0.35%
          </div>
        </div>

        {/* Mission Phase + Sweep */}
        <div className="card">
          <p className="section-label" style={{ marginBottom: 14 }}>MISSION PHASE</p>
          {[{ phase: 'PUMP', status: 'COMPLETE', pct: 100, col: '#14F195' },
            { phase: 'ESKY', status: 'COMPLETE', pct: 100, col: '#14F195' },
            { phase: 'MISSION', status: 'ACTIVE', pct: 68, col: '#9945FF' },
            { phase: 'SCALE', status: 'PENDING', pct: 0, col: '#3a5070' },
            { phase: 'WITHDRAW', status: 'PENDING', pct: 0, col: '#3a5070' },
          ].map(({ phase, status, pct, col }) => (
            <div key={phase} style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, color: col }}>{phase}</span>
                <span className="badge" style={{ background: 'transparent', border: 'none', color: col, padding: 0, fontSize: 10 }}>{status}</span>
              </div>
              <div className="progress-track">
                <div className="progress-fill" style={{ width: `${pct}%`, background: col }} />
              </div>
            </div>
          ))}
          <div className="divider" />
          {/* Sweep button */}
          <div style={{ textAlign: 'center' }}>
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: '#3a5070', marginBottom: 12 }}>
              ACCUMULATED YIELD: <span style={{ color: '#14F195', fontWeight: 700 }}>$847.33</span>
            </p>
            <button
              className={`btn ${sweepDone ? 'btn-green' : 'btn-primary'}`}
              style={{
                width: '100%', fontSize: 13, padding: '14px',
                boxShadow: sweepDone ? '0 0 30px rgba(20,241,149,0.5)' : '0 0 20px rgba(153,69,255,0.3)',
                transition: 'all 0.3s',
              }}
              onClick={handleSweep}
              disabled={sweeping}
              data-testid="sweep-btn"
            >
              {sweeping ? (
                <><span style={{ display: 'inline-block', width: 12, height: 12, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.8s linear infinite', marginRight: 8 }} />SWEEPING...</>
              ) : sweepDone ? (
                <>✔ YIELDS SWEPT TO TREASURY</>
              ) : (
                <>⚡ SWEEP ALL YIELDS</>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* AI Config */}
      <div className="card fade-in-4">
        <p className="section-label" style={{ marginBottom: 16 }}>AI CONFIGURATION</p>
        <div className="grid-3" style={{ marginBottom: 20 }}>
          {[
            { key: 'autonomy', label: 'Autonomy Level', color: '#9945FF' },
            { key: 'risk', label: 'Risk Appetite', color: '#F5A623' },
            { key: 'reinvest', label: 'Reinvestment Rate', color: '#14F195' },
          ].map(({ key, label, color }) => (
            <div key={key}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span className="stat-label">{label}</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700, color }}>
                  {aiConfig[key]}%
                </span>
              </div>
              <input
                className="autonomy-slider"
                type="range" min={0} max={100}
                value={aiConfig[key]}
                onChange={e => setAiConfig(prev => ({ ...prev, [key]: Number(e.target.value) }))}
                style={{ '--thumb-col': color }}
              />
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 24 }}>
          {[
            { key: 'selfImprove', label: 'Self-Improvement Mode' },
            { key: 'autoReinvest', label: 'Auto-Reinvest LP' },
          ].map(({ key, label }) => (
            <label key={key} className="toggle-row" style={{ cursor: 'pointer' }}>
              <span className="toggle">
                <input
                  type="checkbox" checked={toggles[key]}
                  onChange={e => setToggles(prev => ({ ...prev, [key]: e.target.checked }))}
                />
                <span className="toggle-slider" />
              </span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: toggles[key] ? '#9945FF' : '#3a5070' }}>
                {label}
              </span>
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}
