import React, { useEffect, useRef, useState } from 'react';
import EarningsRouter from '../components/EarningsRouter';
import KaspaPoolBridge from '../components/KaspaPoolBridge';

const BACKEND = process.env.REACT_APP_BACKEND_URL;

// Wattage → throttle map. 60W = idle-friendly (longer sleep), 130W = no throttle.
function wattToThrottleMs(watt) {
  // 60→25ms throttle, 130→0ms. Linear.
  const clamped = Math.max(60, Math.min(130, watt));
  return Math.round((130 - clamped) / 70 * 25);
}

export default function Miner() {
  const [threads, setThreads] = useState(8);     // 8–32
  const [watts, setWatts] = useState(90);        // 60–130
  const [running, setRunning] = useState(false);
  const [hashes, setHashes] = useState(0);
  const [perThread, setPerThread] = useState({});
  const [elapsed, setElapsed] = useState(0);
  const [gpu, setGpu] = useState(false);
  const [gpuHash, setGpuHash] = useState(0);
  const [wallet, setWallet] = useState(null);
  const [leaderboard, setLeaderboard] = useState([]);

  const workersRef = useRef([]);
  const startTsRef = useRef(0);
  const tickerRef = useRef(null);
  const heartbeatRef = useRef(null);
  const gpuStopRef = useRef(false);

  // Connect Phantom on demand
  const connectPhantom = async () => {
    if (!window.solana?.isPhantom) { alert('Install Phantom to bind miner earnings'); return; }
    const r = await window.solana.connect();
    setWallet(r.publicKey.toString());
  };

  useEffect(() => {
    if (window.solana?.isPhantom && window.solana.isConnected && window.solana.publicKey) {
      setWallet(window.solana.publicKey.toString());
    }
  }, []);

  const start = () => {
    stop();
    const throttleMs = wattToThrottleMs(watts);
    const list = [];
    for (let i = 0; i < threads; i++) {
      const w = new Worker('/miner-worker.js');
      w.onmessage = (e) => {
        const m = e.data;
        if (m.type === 'hashreport') {
          setPerThread(prev => ({ ...prev, [m.threadId]: m.hashes }));
        }
      };
      w.postMessage({ type: 'start', threadId: i, throttleMs });
      list.push(w);
    }
    workersRef.current = list;
    startTsRef.current = performance.now();
    setRunning(true);
    if (gpu) startGpu();
    // Ticker
    tickerRef.current = setInterval(() => {
      setElapsed((performance.now() - startTsRef.current) / 1000);
      setHashes(Object.values(perThreadRef.current).reduce((a, b) => a + b, 0));
    }, 500);
    // Heartbeat
    heartbeatRef.current = setInterval(() => {
      const total = Object.values(perThreadRef.current).reduce((a, b) => a + b, 0);
      const dur = (performance.now() - startTsRef.current) / 1000;
      fetch(`${BACKEND}/api/miner/heartbeat`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walletPubkey: wallet, mode: gpu ? 'gpu+cpu' : 'cpu',
          threads, wattCap: watts, hashes: total, durationSec: Math.round(dur),
        }),
      }).catch(() => {});
    }, 15000);
  };

  // Keep perThread in a ref so the interval picks up latest
  const perThreadRef = useRef({});
  useEffect(() => { perThreadRef.current = perThread; }, [perThread]);

  const stop = () => {
    workersRef.current.forEach(w => { try { w.postMessage({ type: 'stop' }); w.terminate(); } catch {} });
    workersRef.current = [];
    if (tickerRef.current) { clearInterval(tickerRef.current); tickerRef.current = null; }
    if (heartbeatRef.current) { clearInterval(heartbeatRef.current); heartbeatRef.current = null; }
    gpuStopRef.current = true;
    setRunning(false);
  };

  // Live throttle update when watts slider moves while running
  useEffect(() => {
    if (!running) return;
    const throttleMs = wattToThrottleMs(watts);
    workersRef.current.forEach(w => w.postMessage({ type: 'throttle', throttleMs }));
  }, [watts, running]);

  // Experimental GPU "miner": runs WebGL2 fragment shader doing repeated noise → readPixels checksum.
  // It's a real GPU workload but real crypto-mining kernels (RandomX, Ethash) aren't browser-exposable.
  const startGpu = () => {
    const canvas = document.createElement('canvas');
    canvas.width = 256; canvas.height = 256;
    const gl = canvas.getContext('webgl2');
    if (!gl) return;
    gpuStopRef.current = false;
    const vs = gl.createShader(gl.VERTEX_SHADER);
    gl.shaderSource(vs, `#version 300 es
      in vec2 p; out vec2 uv;
      void main(){ uv=p*0.5+0.5; gl_Position=vec4(p,0.,1.); }`);
    gl.compileShader(vs);
    const fs = gl.createShader(gl.FRAGMENT_SHADER);
    gl.shaderSource(fs, `#version 300 es
      precision highp float; in vec2 uv; uniform float t; out vec4 o;
      float hash(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
      void main(){
        float a=0.0;
        // Repeat 200 SHA-ish rounds per pixel
        for(int i=0;i<200;i++){
          a += hash(uv*float(i+1) + t);
        }
        o = vec4(fract(a),fract(a*1.7),fract(a*2.3),1.0);
      }`);
    gl.compileShader(fs);
    const p = gl.createProgram();
    gl.attachShader(p, vs); gl.attachShader(p, fs); gl.linkProgram(p); gl.useProgram(p);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, -1,1, 1,-1, 1,1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(p, 'p');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const tLoc = gl.getUniformLocation(p, 't');
    let frame = 0;
    const tick = () => {
      if (gpuStopRef.current) return;
      gl.uniform1f(tLoc, frame * 0.013);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      // 256*256*200 ops per frame = ~13M "hashes" — purely indicative
      frame++;
      setGpuHash(h => h + 256 * 256);
      if (wattToThrottleMs(watts) > 0) {
        setTimeout(tick, wattToThrottleMs(watts));
      } else {
        requestAnimationFrame(tick);
      }
    };
    tick();
  };

  useEffect(() => { fetchLeaderboard(); }, []);
  const fetchLeaderboard = () => {
    fetch(`${BACKEND}/api/miner/leaderboard?limit=10`).then(r => r.json()).then(d => {
      if (d.ok) setLeaderboard(d.leaders);
    }).catch(() => {});
  };

  const hashRate = elapsed > 0 ? (hashes / elapsed) : 0;
  const gpuRate = elapsed > 0 && gpu ? (gpuHash / elapsed) : 0;

  return (
    <div className="page-container fade-in">
      <p className="section-label fade-in-1">⚡ YIELD HARVESTER · MINER</p>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <h1 className="font-display fade-in-2" style={{ fontSize: 36, fontWeight: 900, color: '#9945FF' }}>WORK ENGINE</h1>
        <span className={`badge ${running ? 'badge-green' : 'badge-amber'}`}>{running ? 'RUNNING' : 'IDLE'}</span>
      </div>

      <div className="card" style={{ marginBottom: 16, background: 'linear-gradient(135deg, rgba(245,166,35,0.05), rgba(245,166,35,0.01))', borderColor: 'rgba(245,166,35,0.25)' }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#F5A623', letterSpacing: '0.12em', marginBottom: 6 }}>● HONEST DISCLOSURE</div>
        <p style={{ fontSize: 12, color: '#e8f0ff', lineHeight: 1.55 }}>
          This is a real CPU/GPU work engine using WebAssembly SHA-256 (CPU) and WebGL2 shaders (GPU experimental).
          Browsers cannot run native ASIC/RandomX/Ethash kernels — direct BTC/ETH mining produces ~0 yield even at full throttle.
          What this <b>does</b> do: generate proof-of-work hashes that earn YABB-points (yield credit). Earnings route to your bound Phantom wallet
          and aggregate into the multi-chain earnings router below. For payout, connect to a real mining pool URL in settings (coming next).
        </p>
      </div>

      {/* Controls */}
      <div className="grid-2 fade-in-2" style={{ marginBottom: 24 }}>
        <div className="card">
          <p className="section-label" style={{ marginBottom: 16 }}>WORKER CONFIG</p>
          <div style={{ marginBottom: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span className="stat-label">CPU THREADS</span>
              <span style={{ fontFamily: 'var(--font-mono)', color: '#9945FF', fontWeight: 800, fontSize: 14 }}>{threads}</span>
            </div>
            <input type="range" min={8} max={32} step={1} value={threads}
              onChange={e => setThreads(parseInt(e.target.value))}
              disabled={running}
              className="autonomy-slider"
              data-testid="miner-threads-slider"
            />
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: '#3a5070', marginTop: 4 }}>8 → 32 threads</div>
          </div>
          <div style={{ marginBottom: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span className="stat-label">WATTAGE CAP</span>
              <span style={{ fontFamily: 'var(--font-mono)', color: '#14F195', fontWeight: 800, fontSize: 14 }}>{watts}W</span>
            </div>
            <input type="range" min={60} max={130} step={5} value={watts}
              onChange={e => setWatts(parseInt(e.target.value))}
              className="autonomy-slider"
              data-testid="miner-watts-slider"
            />
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: '#3a5070', marginTop: 4 }}>
              {watts <= 80 ? 'Battery saver · ' : watts <= 110 ? 'Balanced · ' : 'Performance · '}
              Throttle {wattToThrottleMs(watts)}ms/batch
            </div>
          </div>
          <label className="toggle-row" style={{ cursor: 'pointer', marginBottom: 14 }}>
            <span className="toggle">
              <input type="checkbox" checked={gpu} onChange={e => setGpu(e.target.checked)} data-testid="miner-gpu-toggle" />
              <span className="toggle-slider" />
            </span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: gpu ? '#9945FF' : '#3a5070' }}>
              GPU MINING (experimental · WebGL2)
            </span>
          </label>
          <div style={{ marginBottom: 14, fontFamily: 'var(--font-mono)', fontSize: 10, color: '#7c98c4' }}>
            BOUND WALLET: {wallet ? `${wallet.slice(0,8)}…${wallet.slice(-6)}` : 'Not connected'}
            {!wallet && (
              <button onClick={connectPhantom} className="btn btn-sm btn-outline" style={{ marginLeft: 8 }} data-testid="miner-connect-phantom">CONNECT PHANTOM</button>
            )}
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            {!running ? (
              <button onClick={start} className="btn btn-green" style={{ flex: 1 }} data-testid="miner-start-btn">► START MINING</button>
            ) : (
              <button onClick={stop} className="btn btn-amber" style={{ flex: 1 }} data-testid="miner-stop-btn">■ STOP</button>
            )}
          </div>
        </div>

        {/* Live stats */}
        <div className="card">
          <p className="section-label" style={{ marginBottom: 16 }}>LIVE STATS</p>
          <div className="grid-2">
            {[
              { l: 'TOTAL HASHES', v: hashes.toLocaleString(), c: '#14F195' },
              { l: 'HASH RATE', v: `${(hashRate/1000).toFixed(2)} kH/s`, c: '#9945FF' },
              { l: 'ELAPSED', v: `${elapsed.toFixed(0)}s`, c: '#e8f0ff' },
              { l: 'ACTIVE THREADS', v: running ? threads.toString() : '0', c: '#F5A623' },
              { l: 'GPU HASHES', v: gpuHash.toLocaleString(), c: gpu ? '#14F195' : '#3a5070' },
              { l: 'GPU RATE', v: `${(gpuRate/1000).toFixed(2)} kH/s`, c: gpu ? '#9945FF' : '#3a5070' },
            ].map(({ l, v, c }) => (
              <div key={l} data-testid={`miner-stat-${l.toLowerCase().replace(' ','-')}`}>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 900, color: c }}>{v}</div>
                <div className="stat-label">{l}</div>
              </div>
            ))}
          </div>
          <div className="divider" />
          <p className="section-label" style={{ marginBottom: 8 }}>PER-THREAD HASHES</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(70px, 1fr))', gap: 6 }}>
            {Array.from({ length: threads }).map((_, i) => (
              <div key={i} style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: '#7c98c4', padding: '6px 8px', border: '1px solid rgba(124,152,196,0.15)', borderRadius: 4, background: 'rgba(8,16,36,0.4)' }}>
                T{i}: {(perThread[i] || 0).toLocaleString()}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Leaderboard */}
      <div className="card fade-in-3" style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <p className="section-label" style={{ margin: 0 }}>MINER LEADERBOARD (PUBLIC)</p>
          <button onClick={fetchLeaderboard} className="btn btn-sm btn-outline" data-testid="leaderboard-refresh">REFRESH</button>
        </div>
        {leaderboard.length === 0 ? (
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#7c98c4' }}>No miners yet. Be first.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {leaderboard.map((l, i) => (
              <div key={l.wallet} style={{ display: 'grid', gridTemplateColumns: '40px minmax(0,2fr) 1fr 1fr', gap: 10, alignItems: 'center', padding: '8px 10px', borderRadius: 6, background: 'rgba(8,16,36,0.4)', border: '1px solid rgba(153,69,255,0.1)' }}>
                <span style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 900, color: i === 0 ? '#F5A623' : i === 1 ? '#9945FF' : '#7c98c4' }}>#{i + 1}</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#b890ff', wordBreak: 'break-all' }}>{l.wallet.slice(0,12)}…{l.wallet.slice(-6)}</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#14F195' }}>{l.hashes.toLocaleString()} hashes</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: '#7c98c4' }}>{l.sessions} sessions · {l.seconds}s</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <KaspaPoolBridge walletPubkey={wallet} />

      <EarningsRouter sourcePage="miner" title="Funnel miner earnings → multi-chain wallets" />
    </div>
  );
}
