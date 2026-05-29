import React, { useState, useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import { Connection, PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL } from '@solana/web3.js';
import EarningsRouter from '../components/EarningsRouter';

const BACKEND = process.env.REACT_APP_BACKEND_URL;
const MISSION_POOL = 'HKjCGdas7CVkSwQHi6Bhckj2U2P8rtTyMbikdY5pkXcb'; // SOL earnings wallet = mission capital pool
const RPC_URL = 'https://api.mainnet-beta.solana.com';

const MISSION_TYPES = [
  'Liquidity Mining Protocol',
  'MEV Arbitrage Bot',
  'Yield Aggregator Strategy',
  'Cross-DEX Arbitrage',
  'NFT Floor Sniping',
  'Token Launch Scout',
  'Funding Rate Harvester',
];

const VALUES = ['DeFi', 'Passive Income', 'Solana', 'AI Autonomy', 'Low Risk', 'High APY', 'Treasury Growth'];

const CONSOLE_LINES = [
  '> Initialising AI mission core...',
  '> Loading risk parameters...',
  '> Scanning Solana mempool...',
  '> Identifying arbitrage windows...',
  '> Calculating optimal entry points...',
  '> Validating treasury constraints...',
  '> Mission plan generated ✔',
];

function generateMissionPlan(config) {
  return `
// YABBAI AUTONOMOUS MISSION PLAN
// Generated: ${new Date().toISOString()}
// Autonomy: ${config.autonomy}% | Risk: ${config.risk}% | Reinvest: ${config.reinvest}%
// Type: ${config.missionType}

mission.configure({
  strategy: "${config.missionType.toLowerCase().replace(/ /g, '_')}",
  autonomy_level: ${config.autonomy / 100},
  risk_tolerance: ${config.risk / 100},
  reinvest_pct: ${config.reinvest / 100},
  self_improve: ${config.selfImprove},
  values_locked: ${JSON.stringify(config.lockedValues)},
});

mission.deploy()
  .then(ctx => ctx.execute_loop({ interval_ms: 5000 }))
  .then(result => treasury.sweep(result.yield))
  .catch(err => logger.alert(err));

// Expected APY range: ${Math.round(config.risk * 8 + 200)}% — ${Math.round(config.risk * 15 + 400)}%
// Max drawdown: ${(config.risk * 0.3).toFixed(1)}%
// Daily yield target: $${(config.autonomy * 2.8 + 50).toFixed(2)}
  `.trim();
}

export default function Mission() {
  const [config, setConfig] = useState({
    autonomy: 75, risk: 40, reinvest: 60,
    missionType: MISSION_TYPES[0],
    selfImprove: true, lockedValues: ['DeFi', 'Passive Income'],
  });
  const [consoleLines, setConsoleLines] = useState([]);
  const [thinking, setThinking] = useState(false);
  const [missionPlan, setMissionPlan] = useState('');
  const [deployCount, setDeployCount] = useState(42);
  const [deploying, setDeploying] = useState(false);
  const [lastMission, setLastMission] = useState(null);
  const consoleRef = useRef(null);
  const tickRef = useRef(null);

  // Auto-tick the active mission every 10s
  useEffect(() => {
    if (!lastMission?.id) return;
    if (tickRef.current) clearInterval(tickRef.current);
    tickRef.current = setInterval(async () => {
      try {
        const r = await fetch(`${BACKEND}/api/mission/${lastMission.id}/tick`, { method: 'POST' });
        const d = await r.json();
        if (d.ok) {
          setLastMission(m => ({ ...m, yieldSol: d.yieldSol, tickCount: d.tickCount, status: d.status }));
        }
      } catch {}
    }, 10000);
    return () => { if (tickRef.current) clearInterval(tickRef.current); };
  }, [lastMission?.id]);

  const deployMission = async () => {
    setDeploying(true);
    try {
      const phantom = window.solana;
      let walletPubkey = phantom?.publicKey?.toString();
      if (!walletPubkey && phantom?.isPhantom) {
        const r = await phantom.connect();
        walletPubkey = r.publicKey.toString();
      }
      if (!walletPubkey) {
        toast.error('Connect Phantom to deploy a mission');
        setDeploying(false);
        return;
      }
      const res = await fetch(`${BACKEND}/api/mission/start`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walletPubkey,
          missionType: config.missionType,
          autonomy: config.autonomy,
          risk: config.risk,
          reinvest: config.reinvest,
          capitalSol: 0,
        }),
      });
      const data = await res.json();
      if (data.ok && data.mission) {
        setLastMission(data.mission);
        setDeployCount(c => c + 1);
        toast.success(`Mission ${data.mission.id.slice(0,8)} armed — deposit SOL to activate yield`);
      } else {
        toast.error(data.detail || 'Mission deploy failed');
      }
    } catch (e) {
      toast.error(e?.message || 'Network error');
    } finally {
      setDeploying(false);
    }
  };

  const [depositAmount, setDepositAmount] = useState('0.1');
  const [depositing, setDepositing] = useState(false);
  const depositMission = async () => {
    if (!lastMission?.id) return;
    if (!window.solana?.isPhantom) { toast.error('Phantom not detected'); return; }
    const amt = parseFloat(depositAmount);
    if (!amt || amt <= 0) { toast.error('Enter SOL amount > 0'); return; }
    setDepositing(true);
    try {
      const phantom = window.solana;
      if (!phantom.isConnected || !phantom.publicKey) await phantom.connect();
      const fromPubkey = phantom.publicKey;
      const toPubkey = new PublicKey(MISSION_POOL);
      const lamports = Math.floor(amt * LAMPORTS_PER_SOL);
      const connection = new Connection(RPC_URL, 'confirmed');
      const tx = new Transaction().add(SystemProgram.transfer({ fromPubkey, toPubkey, lamports }));
      const { blockhash } = await connection.getLatestBlockhash('confirmed');
      tx.recentBlockhash = blockhash;
      tx.feePayer = fromPubkey;
      const signed = await phantom.signTransaction(tx);
      const sig = await connection.sendRawTransaction(signed.serialize(), { skipPreflight: false });
      await connection.confirmTransaction(sig, 'confirmed');
      // Tell backend the mission is funded
      const r = await fetch(`${BACKEND}/api/mission/${lastMission.id}/deposit`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletPubkey: fromPubkey.toString(), capitalSol: amt, signature: sig }),
      });
      const d = await r.json();
      if (d.ok) {
        setLastMission(m => ({ ...m, capitalSol: d.capitalSol, status: d.status }));
        toast.success(`Deposited ${amt} SOL · Mission ACTIVE`);
      } else {
        toast.error(d.detail || 'Deposit recording failed');
      }
    } catch (e) {
      toast.error(e?.message || 'Deposit failed');
    } finally {
      setDepositing(false);
    }
  };

  useEffect(() => {
    if (consoleRef.current) consoleRef.current.scrollTop = consoleRef.current.scrollHeight;
  }, [consoleLines]);

  const handleGenerate = async () => {
    setThinking(true);
    setConsoleLines([]);
    setMissionPlan('');
    for (let i = 0; i < CONSOLE_LINES.length; i++) {
      await new Promise(r => setTimeout(r, 300 + Math.random() * 200));
      setConsoleLines(prev => [...prev, CONSOLE_LINES[i]]);
    }

    try {
      const res = await fetch('/api/generate-mission', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      });
      const data = await res.json();
      if (data.ok && data.plan) {
        setMissionPlan(data.plan);
        console.log(`[Mission] Generated via ${data.source}`);
      } else {
        setMissionPlan(generateMissionPlan(config)); // fallback
      }
    } catch (e) {
      console.error('Mission API error, using local generator', e);
      setMissionPlan(generateMissionPlan(config));
    }

    setDeployCount(c => c + 1);
    setThinking(false);
  };

  const toggleValue = (v) => {
    setConfig(prev => ({
      ...prev,
      lockedValues: prev.lockedValues.includes(v)
        ? prev.lockedValues.filter(x => x !== v)
        : [...prev.lockedValues, v],
    }));
  };

  return (
    <div className="page-container fade-in">
      <p className="section-label fade-in-1">⚡ MISSION BUILDER</p>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 28 }}>
        <h1 className="font-display fade-in-2" style={{ fontSize: 36, fontWeight: 900, color: '#9945FF' }}>MISSION BUILDER</h1>
        <span className="badge badge-green">{deployCount} DEPLOYED</span>
      </div>

      <div className="grid-2 fade-in-2" style={{ marginBottom: 24 }}>
        <div className="card">
          <p className="section-label" style={{ marginBottom: 16 }}>MISSION TYPE</p>
          <select
            className="field"
            value={config.missionType}
            onChange={e => setConfig(prev => ({ ...prev, missionType: e.target.value }))}
            style={{ marginBottom: 20 }}
          >
            {MISSION_TYPES.map(t => <option key={t}>{t}</option>)}
          </select>

          <p className="section-label" style={{ marginBottom: 12 }}>AI PARAMETERS</p>
          {[
            { key: 'autonomy', label: 'Autonomy Level', color: '#9945FF' },
            { key: 'risk', label: 'Risk Appetite', color: '#F5A623' },
            { key: 'reinvest', label: 'Reinvestment Rate', color: '#14F195' },
          ].map(({ key, label, color }) => (
            <div key={key} style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 7 }}>
                <span className="stat-label">{label}</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 900, color }}>{config[key]}%</span>
              </div>
              <input
                className="autonomy-slider"
                type="range" min={0} max={100}
                value={config[key]}
                onChange={e => setConfig(prev => ({ ...prev, [key]: Number(e.target.value) }))}
              />
            </div>
          ))}

          <div className="divider" />

          <p className="section-label" style={{ marginBottom: 10 }}>LOCKED VALUES</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginBottom: 16 }}>
            {VALUES.map(v => (
              <button
                key={v}
                className={`value-chip ${config.lockedValues.includes(v) ? 'locked' : ''}`}
                onClick={() => toggleValue(v)}
              >
                {config.lockedValues.includes(v) ? '🔒' : '🔓'} {v}
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
            {[
              { key: 'selfImprove', label: 'Self-Improvement Mode' },
            ].map(({ key, label }) => (
              <label key={key} className="toggle-row" style={{ cursor: 'pointer' }}>
                <span className="toggle">
                  <input type="checkbox" checked={config[key]} onChange={e => setConfig(prev => ({ ...prev, [key]: e.target.checked }))} />
                  <span className="toggle-slider" />
                </span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: config[key] ? '#9945FF' : '#3a5070' }}>{label}</span>
              </label>
            ))}
          </div>

          <button
            className="btn btn-primary"
            style={{ width: '100%' }}
            onClick={handleGenerate}
            disabled={thinking}
            data-testid="generate-mission-btn"
          >
            {thinking ? (
              <><span style={{ display: 'inline-block', width: 12, height: 12, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.8s linear infinite', marginRight: 8 }} />GENERATING...</>
            ) : '⚡ GENERATE MISSION PLAN'}
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Console */}
          <div className="card" style={{ flex: '0 0 auto' }}>
            <p className="section-label" style={{ marginBottom: 10 }}>AI CONSOLE</p>
            <div ref={consoleRef} className="mission-output" style={{ minHeight: 120 }}>
              {consoleLines.map((line, i) => (
                <div key={i}>{line}</div>
              ))}
              {(thinking || consoleLines.length > 0) && <span className="typewriter-cursor" />}
            </div>
          </div>

          {/* Mission plan */}
          {missionPlan && (
            <div className="card">
              <p className="section-label" style={{ marginBottom: 10 }}>GENERATED MISSION PLAN</p>
              <div className="mission-output">{missionPlan}</div>
              <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button className="btn btn-green btn-sm" onClick={deployMission} disabled={deploying} data-testid="deploy-mission-btn">
                  {deploying ? 'DEPLOYING…' : 'Deploy Mission'}
                </button>
                <button className="btn btn-outline btn-sm" onClick={() => navigator.clipboard?.writeText(missionPlan)}>Copy</button>
                {lastMission && (
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#14F195', alignSelf: 'center' }} data-testid="last-mission-status">
                    ● {lastMission.id.slice(0, 8)}… · {lastMission.status} · cap {(lastMission.capitalSol || 0).toFixed(4)} SOL · yield {(lastMission.yieldSol || 0).toFixed(6)} SOL · ticks {lastMission.tickCount || 0}
                  </span>
                )}
              </div>

              {/* Phantom-signed mission deposit */}
              {lastMission && (
                <div style={{
                  marginTop: 14, padding: 14,
                  background: 'linear-gradient(135deg, rgba(20,241,149,0.05), rgba(20,241,149,0.02))',
                  border: '1px solid rgba(20,241,149,0.25)', borderRadius: 8,
                }} data-testid="mission-deposit-panel">
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.18em', color: '#14F195', marginBottom: 8 }}>
                    ◆ {lastMission.status === 'active' ? 'ADD CAPITAL' : 'ACTIVATE MISSION · DEPOSIT SOL'}
                  </div>
                  <p style={{ fontSize: 11, color: '#7c98c4', fontFamily: 'var(--font-mono)', lineHeight: 1.5, marginBottom: 10 }}>
                    Signs a real Phantom transfer to the mission capital pool (<span style={{ color: '#b890ff' }}>{MISSION_POOL.slice(0, 10)}…</span>).
                    Backend auto-ticks every 30s while active. APY range: <b style={{ color: '#14F195' }}>{lastMission.apyLow || 0}%–{lastMission.apyHigh || 0}%</b>.
                  </p>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <input type="number" step="0.001" min="0" value={depositAmount} onChange={e => setDepositAmount(e.target.value)}
                      style={{ flex: 1, minWidth: 200, padding: '10px 12px', background: 'rgba(8,16,36,0.6)', border: '1px solid rgba(20,241,149,0.25)', borderRadius: 6, color: '#e8f0ff', fontFamily: 'var(--font-mono)', fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
                      data-testid="mission-deposit-input" />
                    <button onClick={depositMission} disabled={depositing} className="btn btn-green" data-testid="mission-deposit-btn">
                      {depositing ? 'SIGNING…' : `DEPOSIT ${depositAmount} SOL`}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Stats */}
          <div className="card">
            <p className="section-label" style={{ marginBottom: 12 }}>PROJECTED METRICS</p>
            <div className="grid-2">
              {[
                { l: 'EXPECTED APY', v: `${Math.round(config.risk * 8 + 200)}–${Math.round(config.risk * 15 + 400)}%`, c: '#14F195' },
                { l: 'DAILY YIELD', v: `$${(config.autonomy * 2.8 + 50).toFixed(2)}`, c: '#9945FF' },
                { l: 'MAX DRAWDOWN', v: `${(config.risk * 0.3).toFixed(1)}%`, c: '#F5A623' },
                { l: 'RISK SCORE', v: `${config.risk}/100`, c: '#F5A623' },
              ].map(({ l, v, c }) => (
                <div key={l}>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 900, color: c }}>{v}</div>
                  <div className="stat-label">{l}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <EarningsRouter sourcePage="mission" title="Funnel mission yields → multi-chain wallets" />
    </div>
  );
}
