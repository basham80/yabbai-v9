import React, { useState, useEffect, useRef } from 'react';
import EarningsRouter from '../components/EarningsRouter';

const PAIN_POINTS = [
  { id: 1, text: 'Cashflow inconsistency — no reliable revenue stream', severity: 'high' },
  { id: 2, text: 'High agency/contractor costs eating margins', severity: 'high' },
  { id: 3, text: 'No automated collection for small ticket items', severity: 'med' },
  { id: 4, text: 'Manual invoicing consuming 8+ hrs/week', severity: 'med' },
  { id: 5, text: 'Untapped affiliate potential in email list', severity: 'low' },
  { id: 6, text: 'Underutilised IP: courses, templates, toolkits', severity: 'low' },
];

const COLONIES = [
  { id: 'c1', name: 'Plumbing Co.', owner: 'M. Basham', rev: 280000, pot: 420000, status: 'active' },
  { id: 'c2', name: 'Landscaping Ltd', owner: 'J. Green', rev: 145000, pot: 210000, status: 'active' },
  { id: 'c3', name: 'Electrical Services', owner: 'T. Walsh', rev: 380000, pot: 550000, status: 'prospect' },
  { id: 'c4', name: 'HVAC Specialists', owner: 'R. Cooper', rev: 220000, pot: 330000, status: 'active' },
];

const WEALTH_STREAMS = [
  { id: 1, name: 'Agency retainer income', type: 'Active', monthly: 12500, status: 'live' },
  { id: 2, name: 'DFY service packages', type: 'Active', monthly: 8200, status: 'live' },
  { id: 3, name: 'Affiliate commissions', type: 'Passive', monthly: 3400, status: 'live' },
  { id: 4, name: 'Course / info products', type: 'Passive', monthly: 1800, status: 'building' },
  { id: 5, name: 'Fractional CFO consulting', type: 'Active', monthly: 9600, status: 'live' },
  { id: 6, name: 'YABBAI token yield', type: 'Passive', monthly: 4200, status: 'live' },
  { id: 7, name: 'SaaS subscription (BASHAM)', type: 'Passive', monthly: 2100, status: 'building' },
];

const AUDIT_QUESTIONS = [
  'What is your current monthly recurring revenue?',
  'What percentage of revenue is passive vs active?',
  'What is your biggest time cost each week?',
  'What systems do you currently have automated?',
  'What is your target annual income?',
];

function useTypewriter(text, speed = 18) {
  const [displayed, setDisplayed] = useState('');
  const [done, setDone] = useState(false);
  useEffect(() => {
    setDisplayed('');
    setDone(false);
    if (!text) return;
    let i = 0;
    const id = setInterval(() => {
      i++;
      setDisplayed(text.slice(0, i));
      if (i >= text.length) { clearInterval(id); setDone(true); }
    }, speed);
    return () => clearInterval(id);
  }, [text, speed]);
  return { displayed, done };
}

export default function Basham() {
  const [tab, setTab] = useState('audit');
  const [answers, setAnswers] = useState(Array(AUDIT_QUESTIONS.length).fill(''));
  const [auditRunning, setAuditRunning] = useState(false);
  const [wealthScore, setWealthScore] = useState(null);
  const [wealthMap, setWealthMap] = useState(null);
  const [mapText, setMapText] = useState('');
  const { displayed, done } = useTypewriter(mapText, 12);

  const allAnswered = answers.every(a => a.trim().length > 0);

  const runAudit = async () => {
    setAuditRunning(true);
    await new Promise(r => setTimeout(r, 2200));
    const score = Math.round(42 + Math.random() * 45);
    setWealthScore(score);
    setWealthMap(true);
    setMapText(generateWealthMap(score, answers));
    setAuditRunning(false);
    setTab('map');
  };

  const generateWealthMap = (score, ans) => {
    const mrr = ans[0] || '$12,500';
    const target = ans[4] || '$500,000';
    return `BASHAM WEALTH MAP — Score: ${score}/100
Generated: ${new Date().toLocaleString()}

--- CURRENT STATE ---
MRR: ${mrr}
Target Annual: ${target}

--- IMMEDIATE WINS ---
1. Automate invoicing → save 8hrs/week → $1,200/month recovered
2. Package IP into productised service → +$3,500 MRR
3. Activate affiliate programme → +$800–2,400/month passive
4. YABBAI treasury allocation → compounding yield baseline

--- 90-DAY PLAN ---
Week 1-2: Audit & systematise top 3 revenue streams
Week 3-4: Launch productised offer #1
Week 5-8: Affiliate stack activation
Week 9-12: Passive income velocity review

--- WEALTH MULTIPLIER ---
Current trajectory: $${((parseFloat(mrr.replace(/[^0-9.]/g, '')) || 12500) * 12).toLocaleString()}/yr
Targeted trajectory: $${((parseFloat(mrr.replace(/[^0-9.]/g, '')) || 12500) * 12 * 2.8).toLocaleString()}/yr
Multiplier: 2.8x in 12 months`;
  };

  const totalLiveMonthly = WEALTH_STREAMS.filter(s => s.status === 'live').reduce((a, s) => a + s.monthly, 0);

  return (
    <div className="page-container fade-in" style={{ '--void': 'var(--ink)', '--void-2': 'var(--ink-2)', '--void-3': 'var(--ink-3)' }}>
      <p className="section-label-gold fade-in-1" style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--gold)', marginBottom: 6 }}>
        ▦ BASHAM PROTOCOL
      </p>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 28 }}>
        <h1 className="font-display fade-in-2" style={{ fontSize: 36, fontWeight: 900, color: 'var(--gold)' }}>GOLD HARVESTER</h1>
        <span className="badge badge-gold">BASHAM</span>
        <span className="live-dot live-dot-gold" />
      </div>

      {/* Summary */}
      <div className="grid-4 fade-in-2" style={{ marginBottom: 24 }}>
        {[
          { l: 'LIVE MONTHLY', v: `$${totalLiveMonthly.toLocaleString()}`, c: 'var(--gold)' },
          { l: 'ANNUAL RUN RATE', v: `$${(totalLiveMonthly * 12).toLocaleString()}`, c: 'var(--signal-green)' },
          { l: 'WEALTH SCORE', v: wealthScore ? `${wealthScore}/100` : '—', c: 'var(--gold)' },
          { l: 'COLONIES', v: COLONIES.filter(c => c.status === 'active').length.toString(), c: 'var(--warm-white)' },
        ].map(({ l, v, c }) => (
          <div key={l} className="basham-card">
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 900, color: c }}>{v}</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.12em', color: '#5a5a40', marginTop: 4 }}>{l}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {['audit', 'map', 'streams', 'colonies'].map(t => (
          <button
            key={t}
            className={`btn btn-sm ${tab === t ? 'btn-gold' : 'btn-outline'}`}
            onClick={() => setTab(t)}
          >
            {t.toUpperCase()}
          </button>
        ))}
      </div>

      {tab === 'audit' && (
        <div className="grid-2 fade-in">
          <div className="basham-card">
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.15em', color: 'var(--gold)', marginBottom: 14, textTransform: 'uppercase' }}>BUSINESS AUDIT</p>
            {AUDIT_QUESTIONS.map((q, i) => (
              <div key={i} style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontFamily: 'var(--font-manrope)', fontSize: 12, color: 'var(--warm-white)', marginBottom: 5 }}>{q}</label>
                <input
                  className="field field-gold"
                  placeholder="Your answer..."
                  value={answers[i]}
                  onChange={e => {
                    const next = [...answers];
                    next[i] = e.target.value;
                    setAnswers(next);
                  }}
                />
              </div>
            ))}
            <button
              className="btn btn-gold"
              style={{ width: '100%' }}
              onClick={runAudit}
              disabled={auditRunning || !allAnswered}
              data-testid="run-audit-btn"
            >
              {auditRunning ? (
                <><span style={{ display: 'inline-block', width: 12, height: 12, border: '2px solid rgba(0,0,0,0.3)', borderTopColor: '#000', borderRadius: '50%', animation: 'spin 0.8s linear infinite', marginRight: 8 }} />RUNNING AUDIT...</>
              ) : '▦ RUN WEALTH AUDIT'}
            </button>
          </div>
          <div className="basham-card">
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.15em', color: 'var(--gold)', marginBottom: 14, textTransform: 'uppercase' }}>PAIN POINTS IDENTIFIED</p>
            {PAIN_POINTS.map(p => (
              <div key={p.id} className={`pain-item ${p.severity === 'high' ? 'pain-high' : p.severity === 'med' ? 'pain-med' : 'pain-low'}`}>
                <span style={{ color: 'var(--warm-white)', flex: 1 }}>{p.text}</span>
                <span className={`badge ${p.severity === 'high' ? 'badge-red' : p.severity === 'med' ? 'badge-amber' : 'badge-green'}`}>
                  {p.severity}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'map' && (
        <div className="wealth-map fade-in">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
            <div>
              <p style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--gold)', letterSpacing: '0.15em', marginBottom: 4 }}>WEALTH MAP</p>
              {wealthScore && <div className="gold-score">{wealthScore}</div>}
              {wealthScore && <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: '#5a5a40' }}>WEALTH SCORE /100</div>}
            </div>
            {!wealthScore && (
              <div style={{ fontFamily: 'var(--font-manrope)', fontSize: 13, color: '#5a5a40' }}>
                Complete the audit to generate your wealth map
              </div>
            )}
          </div>
          {wealthMap && (
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--gold-light)', lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>
              {displayed}
              {!done && <span className="typewriter-cursor" />}
            </div>
          )}
        </div>
      )}

      {tab === 'streams' && (
        <div className="fade-in">
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.15em', color: 'var(--gold)' }}>WEALTH STREAMS</p>
            <span className="badge badge-gold">${totalLiveMonthly.toLocaleString()}/mo LIVE</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {WEALTH_STREAMS.map(s => (
              <div key={s.id} className="basham-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontFamily: 'var(--font-manrope)', fontSize: 13, color: 'var(--warm-white)', fontWeight: 600 }}>{s.name}</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: '#5a5a40', marginTop: 2 }}>{s.type}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 900, color: s.status === 'live' ? 'var(--gold)' : '#5a5a40' }}>
                    ${s.monthly.toLocaleString()}/mo
                  </div>
                  <span className={`badge ${s.status === 'live' ? 'badge-gold' : 'badge-amber'}`}>{s.status}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'colonies' && (
        <div className="grid-2 fade-in">
          {COLONIES.map(c => (
            <div key={c.id} className="basham-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                <span style={{ fontFamily: 'var(--font-display)', fontSize: 15, color: 'var(--gold)' }}>{c.name}</span>
                <span className={`badge ${c.status === 'active' ? 'badge-gold' : 'badge-amber'}`}>{c.status}</span>
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: '#5a5a40', marginBottom: 8 }}>Owner: {c.owner}</div>
              <div className="grid-2">
                <div>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, color: '#5a5a40' }}>${(c.rev/1000).toFixed(0)}k</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#3a3a20' }}>CURRENT REV</div>
                </div>
                <div>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, color: 'var(--gold)' }}>${(c.pot/1000).toFixed(0)}k</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#3a3a20' }}>POTENTIAL</div>
                </div>
              </div>
              <div className="progress-track" style={{ marginTop: 10 }}>
                <div className="progress-fill-gold progress-fill" style={{ width: `${(c.rev / c.pot) * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}

      <EarningsRouter sourcePage="basham" title="Funnel Gold Harvester earnings → multi-chain wallets" />
    </div>
  );
}
