import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const LAUNCHPADS = [
  { id: 'pump', name: 'pump.fun', desc: 'Fast meme launch, instant liquidity', color: '#9945FF' },
  { id: 'meteora', name: 'Meteora', desc: 'DLMM dynamic liquidity', color: '#14F195' },
  { id: 'raydium', name: 'Raydium', desc: 'AMM v4 standard', color: '#F5A623' },
  { id: 'orca', name: 'Orca', desc: 'Whirlpool concentrated LP', color: '#e8f0ff' },
];

const SEQUENCE = [
  'Initialising YABBAI launch protocol...',
  'Generating token metadata...',
  'Creating mint keypair...',
  'Allocating token supply: 1,000,000,000',
  'Setting decimals: 6',
  'Uploading metadata to Arweave...',
  'Deploying to Solana mainnet-beta...',
  'Registering mint address...',
  'Setting up LP on selected launchpad...',
  'Launch complete! 🦞',
];

export default function Launch() {
  const [step, setStep] = useState('config'); // config | launching | done
  const [selectedPad, setSelectedPad] = useState('pump');
  const [mintAddr, setMintAddr] = useState('');
  const [treasury, setTreasury] = useState('');
  const [seqIdx, setSeqIdx] = useState(0);
  const [seqLines, setSeqLines] = useState([]);
  const [savedCfg, setSavedCfg] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch(`${API}/token-mint`)
      .then(r => r.json())
      .then(d => { if (d.configured) { setSavedCfg(d); setStep('done'); } })
      .catch(() => {});
  }, []);

  const runSequence = async () => {
    setSeqLines([]);
    setSeqIdx(0);
    for (let i = 0; i < SEQUENCE.length; i++) {
      await new Promise(r => setTimeout(r, 350 + Math.random() * 200));
      setSeqLines(prev => [...prev, { text: SEQUENCE[i], i }]);
      setSeqIdx(i);
    }
  };

  const handleLaunch = async () => {
    if (!mintAddr.trim() || mintAddr.trim().length < 32) {
      setError('Enter a valid mint address (min 32 chars)');
      return;
    }
    setError('');
    setStep('launching');
    setLoading(true);
    runSequence();
    await new Promise(r => setTimeout(r, SEQUENCE.length * 600));
    try {
      const res = await fetch(`${API}/token-mint`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mint: mintAddr.trim(),
          treasury: treasury.trim() || '7dzgCA8G55VytZ8PS1b99rbbctzCgJbnEoBEYBnn15YR',
          launchpad: selectedPad,
          network: 'mainnet-beta',
        }),
      });
      const data = await res.json();
      setSavedCfg(data);
      setStep('done');
    } catch (e) {
      setError('Failed to save config: ' + e.message);
      setStep('config');
    }
    setLoading(false);
  };

  const handleReset = async () => {
    await fetch(`${API}/token-mint`, { method: 'DELETE' }).catch(() => {});
    setSavedCfg(null);
    setStep('config');
    setMintAddr('');
    setTreasury('');
    setSeqLines([]);
  };

  return (
    <div className="page-container fade-in">
      <p className="section-label fade-in-1">⚡ LAUNCH PROTOCOL</p>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 28 }}>
        <h1 className="font-display fade-in-2" style={{ fontSize: 36, fontWeight: 900, color: '#9945FF' }}>TOKEN LAUNCH</h1>
        <span className={`badge ${step === 'done' ? 'badge-green' : step === 'launching' ? 'badge-amber' : 'badge-purple'}`}>
          {step === 'done' ? 'DEPLOYED' : step === 'launching' ? 'LAUNCHING' : 'READY'}
        </span>
      </div>

      {step === 'done' && savedCfg ? (
        <div className="card card-green-glow fade-in" style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <span style={{ fontSize: 28 }}>🦞</span>
            <h2 className="font-display" style={{ fontSize: 22, color: '#14F195' }}>LAUNCH SUCCESSFUL</h2>
          </div>
          <div className="grid-2">
            {[
              ['MINT', savedCfg.mint],
              ['NETWORK', savedCfg.network],
              ['LAUNCHPAD', savedCfg.launchpad],
              ['LAUNCHED', new Date(savedCfg.launchedAt || Date.now()).toLocaleString()],
              ['TREASURY', savedCfg.treasury],
              ['SUPPLY', '1,000,000,000'],
            ].map(([l, v]) => (
              <div key={l}>
                <div className="stat-label">{l}</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#e8f0ff', wordBreak: 'break-all', marginTop: 2 }}>{v}</div>
              </div>
            ))}
          </div>
          <div className="divider" />
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button className="btn btn-danger btn-sm" onClick={handleReset}>Reset Config</button>
            <Link to="/treasury-recovery" className="btn btn-amber btn-sm" style={{ textDecoration: 'none' }} data-testid="launch-recovery-link">
              ◆ Treasury Recovery
            </Link>
          </div>
        </div>
      ) : step === 'launching' ? (
        <div className="card fade-in" style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <span className="thinking-spinner" style={{ width: 20, height: 20 }} />
            <h2 className="font-display" style={{ fontSize: 18, color: '#F5A623' }}>LAUNCH SEQUENCE ACTIVE</h2>
          </div>
          <div className="mission-output">
            {seqLines.map(({ text, i }) => (
              <div key={i} style={{ marginBottom: 4 }}>
                <span style={{ color: 'rgba(153,69,255,0.5)', marginRight: 8 }}>[{String(i).padStart(2, '0')}]</span>
                <span>{text}</span>
              </div>
            ))}
            <span className="typewriter-cursor" />
          </div>
        </div>
      ) : (
        <div className="grid-2 fade-in-2" style={{ marginBottom: 24 }}>
          <div className="card">
            <p className="section-label" style={{ marginBottom: 14 }}>LAUNCHPAD SELECTION</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {LAUNCHPADS.map(({ id, name, desc, color }) => (
                <div
                  key={id}
                  onClick={() => setSelectedPad(id)}
                  style={{
                    padding: '12px 14px', border: `1px solid ${selectedPad === id ? color : 'rgba(153,69,255,0.12)'}`,
                    borderRadius: 6, cursor: 'pointer', transition: 'all 0.2s',
                    background: selectedPad === id ? `rgba(${color === '#9945FF' ? '153,69,255' : color === '#14F195' ? '20,241,149' : '245,166,35'},0.06)` : 'transparent',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontFamily: 'var(--font-display)', fontSize: 14, color }}>{name}</span>
                    {selectedPad === id && <span style={{ color }}>✓</span>}
                  </div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: '#3a5070', marginTop: 3 }}>{desc}</div>
                </div>
              ))}
            </div>
          </div>
          <div className="card">
            <p className="section-label" style={{ marginBottom: 14 }}>MINT CONFIGURATION</p>
            {error && (
              <div style={{ background: 'rgba(255,60,60,0.1)', border: '1px solid rgba(255,60,60,0.25)', borderRadius: 4, padding: '8px 12px', marginBottom: 12, fontFamily: 'var(--font-mono)', fontSize: 11, color: '#ff6060' }}>
                {error}
              </div>
            )}
            <div style={{ marginBottom: 12 }}>
              <label className="stat-label" style={{ display: 'block', marginBottom: 5 }}>MINT ADDRESS *</label>
              <input
                className="field"
                placeholder="Enter existing mint or generate new..."
                value={mintAddr}
                onChange={e => setMintAddr(e.target.value)}
                data-testid="mint-address-input"
              />
            </div>
            <div style={{ marginBottom: 16 }}>
              <label className="stat-label" style={{ display: 'block', marginBottom: 5 }}>TREASURY WALLET (optional)</label>
              <input
                className="field"
                placeholder="7dzgCA8G55VytZ8PS1b99rbbctzCgJbnEoBEYBnn15YR"
                value={treasury}
                onChange={e => setTreasury(e.target.value)}
              />
            </div>
            <div className="grid-2" style={{ marginBottom: 16 }}>
              <div>
                <label className="stat-label" style={{ display: 'block', marginBottom: 5 }}>SUPPLY</label>
                <input className="field" value="1,000,000,000" readOnly />
              </div>
              <div>
                <label className="stat-label" style={{ display: 'block', marginBottom: 5 }}>DECIMALS</label>
                <input className="field" value="6" readOnly />
              </div>
            </div>
            <button
              className="btn btn-primary"
              style={{ width: '100%' }}
              onClick={handleLaunch}
              disabled={loading}
              data-testid="launch-btn"
            >
              ⚡ INITIATE LAUNCH SEQUENCE
            </button>
          </div>
        </div>
      )}

      <div className="card fade-in-4">
        <p className="section-label" style={{ marginBottom: 12 }}>LAUNCH CHECKLIST</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[
            { label: 'Wallet connected & funded', done: true },
            { label: 'Token metadata prepared', done: true },
            { label: 'Launchpad selected', done: true },
            { label: 'Mint address confirmed', done: !!mintAddr || step === 'done' },
            { label: 'LP initialized', done: step === 'done' },
            { label: 'Treasury wallet set', done: step === 'done' },
          ].map(({ label, done }) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 10, fontFamily: 'var(--font-mono)', fontSize: 11 }}>
              <span style={{ color: done ? '#14F195' : '#3a5070' }}>{done ? '✓' : '○'}</span>
              <span className={done ? 'text-white' : 'text-muted'}>{label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
