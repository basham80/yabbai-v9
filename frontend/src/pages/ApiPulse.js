import React, { useState, useEffect, useRef } from 'react';

const API_ENDPOINTS = [
  { id: 'jup', name: 'Jupiter Price', category: 'DEX', url: 'api.jup.ag' },
  { id: 'sol-rpc', name: 'Solana RPC', category: 'Chain', url: 'rpc.mainnet-beta' },
  { id: 'sol-ws', name: 'Solana WS', category: 'Chain', url: 'ws.mainnet-beta' },
  { id: 'pyth', name: 'Pyth Oracle', category: 'Oracle', url: 'hermes.pyth.network' },
  { id: 'coingecko', name: 'CoinGecko', category: 'Price', url: 'api.coingecko.com' },
  { id: 'birdeye', name: 'Birdeye', category: 'Analytics', url: 'public-api.birdeye.so' },
  { id: 'raydium', name: 'Raydium AMM', category: 'DEX', url: 'api.raydium.io' },
  { id: 'orca', name: 'Orca Whirlpool', category: 'DEX', url: 'api.orca.so' },
  { id: 'meteora', name: 'Meteora DLMM', category: 'DEX', url: 'dlmm-api.meteora.ag' },
  { id: 'pump', name: 'pump.fun', category: 'Launch', url: 'pump.fun' },
  { id: 'paypal', name: 'PayPal REST', category: 'Payment', url: 'api.paypal.com' },
  { id: 'pp-sdk', name: 'PayPal SDK', category: 'Payment', url: 'sdk.paypal.com' },
  { id: 'stripe', name: 'Stripe API', category: 'Payment', url: 'api.stripe.com' },
  { id: 'coinbase', name: 'Coinbase API', category: 'Payment', url: 'api.coinbase.com' },
  { id: 'arweave', name: 'Arweave Upload', category: 'Storage', url: 'arweave.net' },
  { id: 'ipfs', name: 'IPFS/Pinata', category: 'Storage', url: 'api.pinata.cloud' },
  { id: 'helius', name: 'Helius Enhanced', category: 'Chain', url: 'mainnet.helius-rpc.com' },
  { id: 'quicknode', name: 'QuickNode', category: 'Chain', url: 'quicknode.pro' },
  { id: 'supabase', name: 'Supabase DB', category: 'Database', url: 'supabase.co' },
  { id: 'yabbai-api', name: 'YABBAI API', category: 'Internal', url: 'api.yabbai.io' },
];

const WaveformCanvas = ({ cascadeMode }) => {
  const canvasRef = useRef(null);
  const frameRef = useRef(0);
  const cascadeRef = useRef(cascadeMode);
  useEffect(() => { cascadeRef.current = cascadeMode; }, [cascadeMode]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let raf;
    const draw = () => {
      const W = canvas.width = canvas.offsetWidth;
      const H = canvas.height = 80;
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = 'rgba(6,14,32,0.8)';
      ctx.fillRect(0, 0, W, H);
      const t = (frameRef.current += 1);
      const layers = cascadeRef.current ? [
        { col: 'rgba(153,69,255,0.7)', amp: 18, freq: 0.012, speed: 0.06 },
        { col: 'rgba(20,241,149,0.7)', amp: 14, freq: 0.02, speed: 0.04 },
        { col: 'rgba(245,166,35,0.6)', amp: 10, freq: 0.028, speed: 0.05 },
        { col: 'rgba(255,80,200,0.5)', amp: 7, freq: 0.038, speed: 0.07 },
      ] : [
        { col: 'rgba(153,69,255,0.3)', amp: 12, freq: 0.015, speed: 0.03 },
        { col: 'rgba(20,241,149,0.6)', amp: 8, freq: 0.025, speed: 0.045 },
        { col: 'rgba(20,241,149,1)', amp: 5, freq: 0.035, speed: 0.06 },
      ];
      layers.forEach(({ col, amp, freq, speed }) => {
        ctx.beginPath();
        ctx.strokeStyle = col;
        ctx.lineWidth = 1.5;
        ctx.shadowColor = col;
        ctx.shadowBlur = cascadeRef.current ? 8 : 0;
        for (let x = 0; x <= W; x++) {
          const y = H / 2 + Math.sin(x * freq + t * speed) * amp + Math.sin(x * freq * 2.1 + t * speed * 1.3) * (amp * 0.3);
          x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.shadowBlur = 0;
      });
      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, []);

  return <canvas ref={canvasRef} style={{ width: '100%', height: 80, borderRadius: 6 }} />;
};

export default function ApiPulse() {
  const [apis, setApis] = useState(() =>
    API_ENDPOINTS.map(a => ({
      ...a,
      status: Math.random() > 0.15 ? 'live' : 'error',
      latency: Math.floor(Math.random() * 200 + 20),
      calls: Math.floor(Math.random() * 5000 + 500),
      pulsing: false,
    }))
  );
  const [cascadeMode, setCascadeMode] = useState(false);
  const [totalCalls, setTotalCalls] = useState(24441);
  const [avgLatency, setAvgLatency] = useState(47);

  useEffect(() => {
    const tick = setInterval(() => {
      const idx = Math.floor(Math.random() * apis.length);
      setApis(prev => prev.map((a, i) => {
        if (i !== idx) return a;
        const newLat = Math.max(10, a.latency + Math.floor((Math.random() - 0.5) * 40));
        return {
          ...a,
          latency: newLat,
          calls: a.calls + Math.floor(Math.random() * 15),
          pulsing: true,
          status: Math.random() > 0.05 ? 'live' : 'error',
        };
      }));
      setTotalCalls(c => c + Math.floor(Math.random() * 20 + 5));
      setAvgLatency(l => Math.max(10, l + Math.floor((Math.random() - 0.5) * 10)));
      setTimeout(() => setApis(prev => prev.map((a, i) => i === idx ? { ...a, pulsing: false } : a)), 700);
    }, cascadeMode ? 300 : 1200);
    return () => clearInterval(tick);
  }, [apis.length, cascadeMode]);

  const liveCount = apis.filter(a => a.status === 'live').length;

  return (
    <div className="page-container fade-in">
      <p className="section-label fade-in-1">⚡ API PULSE</p>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 28 }}>
        <h1 className="font-display fade-in-2" style={{ fontSize: 36, fontWeight: 900, color: '#9945FF' }}>API PULSE</h1>
        <span className="badge badge-green">{liveCount}/{apis.length} LIVE</span>
        {cascadeMode && <span className="badge badge-amber">CASCADE MODE</span>}
      </div>

      {/* Waveform */}
      <div className="card fade-in-2" style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="live-dot" />
            <span className="section-label" style={{ margin: 0 }}>PULSE WAVEFORM</span>
          </div>
          <label className="toggle-row" style={{ cursor: 'pointer' }}>
            <span className="toggle">
              <input type="checkbox" checked={cascadeMode} onChange={e => setCascadeMode(e.target.checked)} />
              <span className="toggle-slider" />
            </span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: cascadeMode ? '#F5A623' : '#3a5070' }}>CASCADE MODE</span>
          </label>
        </div>
        <WaveformCanvas cascadeMode={cascadeMode} />
        <div className="grid-4" style={{ marginTop: 12 }}>
          {[
            { l: 'TOTAL CALLS', v: totalCalls.toLocaleString(), c: '#e8f0ff' },
            { l: 'AVG LATENCY', v: `${avgLatency}ms`, c: '#9945FF' },
            { l: 'LIVE ENDPOINTS', v: `${liveCount}/${apis.length}`, c: '#14F195' },
            { l: 'SUCCESS RATE', v: `${((liveCount / apis.length) * 100).toFixed(1)}%`, c: '#14F195' },
          ].map(({ l, v, c }) => (
            <div key={l}>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 900, color: c }}>{v}</div>
              <div className="stat-label">{l}</div>
            </div>
          ))}
        </div>
      </div>

      {/* API Cards */}
      <div className="grid-4 fade-in-3">
        {apis.map(api => (
          <div key={api.id} className={`api-card ${api.pulsing ? 'pulsing' : ''}`}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
              <div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 12, color: '#e8f0ff', marginBottom: 2 }}>{api.name}</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#3a5070' }}>{api.category}</div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3 }}>
                <span className={`badge ${api.status === 'live' ? 'badge-green' : 'badge-red'}`}>{api.status}</span>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, color: api.latency < 100 ? '#14F195' : api.latency < 200 ? '#F5A623' : '#ff6060' }}>
                {api.latency}ms
              </span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#3a5070' }}>{api.calls.toLocaleString()} calls</span>
            </div>
            <div className="api-latency-bar">
              <div className="api-latency-fill" style={{ width: `${Math.min((api.latency / 300) * 100, 100)}%`, background: api.latency < 100 ? '#14F195' : api.latency < 200 ? '#F5A623' : '#ff6060' }} />
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: '#2a3a50', marginTop: 4 }}>{api.url}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
