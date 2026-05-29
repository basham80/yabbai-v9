import React, { useState, useEffect, useRef } from 'react';
import EarningsRouter from '../components/EarningsRouter';

const SIGNAL_FEED = [
  { id: 1, biz: 'ACE Plumbing', owner: 'Mark H.', signal: 'Website not mobile optimised, 3★ reviews, no automation', priority: 1, val: 28000, status: 'contacted' },
  { id: 2, biz: 'Greenleaf Landscaping', owner: 'Sarah T.', signal: 'No CRM, losing quotes, seasonal revenue dip', priority: 1, val: 18500, status: 'new' },
  { id: 3, biz: 'Bright Spark Electrical', owner: 'James R.', signal: 'Manual invoicing, 60-day debtor book, no follow-up system', priority: 2, val: 42000, status: 'new' },
  { id: 4, biz: 'CoolAir HVAC', owner: 'Linda P.', signal: 'Relies on 2 techs, no SOPs, scaling bottleneck', priority: 2, val: 35000, status: 'proposal' },
  { id: 5, biz: 'FastFix Appliances', owner: 'Greg M.', signal: 'No email list, pure word-of-mouth, Google Ads naive', priority: 1, val: 22000, status: 'new' },
  { id: 6, biz: 'SunState Roofing', owner: 'Dave K.', signal: 'Website 2018, no reviews, cash-only (leaking revenue)', priority: 2, val: 55000, status: 'contacted' },
];

const CALL_SCRIPTS = [
  {
    title: 'Cold Intro — Tradie Owner',
    lines: [
      { role: 'YOU', text: '"Hi [Name], this is [Your Name] from BASHAM. I work with trade businesses in [Area] to plug revenue leaks. Quick question — are you losing jobs because follow-up isn\'t happening fast enough?"' },
      { role: 'THEM', text: '(They answer yes / it\'s always a problem)' },
      { role: 'YOU', text: '"Perfect. We\'ve helped [similar business] recover $28k in 90 days just by automating their quote follow-up. I\'d love to show you what\'s possible for yours. Do you have 20 minutes this week or next?"' },
    ],
  },
  {
    title: 'Value Audit Closer',
    lines: [
      { role: 'YOU', text: '"Based on what you\'ve told me, I\'m seeing three immediate revenue leaks in your business. First, your quoting. Second, your review engine. Third, your referral system. Together these are costing you roughly $[X]/month."' },
      { role: 'YOU', text: '"If we fixed just the first two, you\'d see ROI within 30 days. Our engagement is $[PRICE]/month. When can we start?"' },
    ],
  },
];

const STATUS_COLORS = { new: '#9945FF', contacted: '#F5A623', proposal: '#14F195', closed: '#3a5070' };

export default function SideHustle() {
  const [tab, setTab] = useState('signals');
  const [leads, setLeads] = useState(SIGNAL_FEED);
  const [activeScript, setActiveScript] = useState(0);
  const [newBiz, setNewBiz] = useState('');
  const [newSignal, setNewSignal] = useState('');
  const [newVal, setNewVal] = useState('');

  const addLead = () => {
    if (!newBiz.trim()) return;
    setLeads(prev => [{
      id: Date.now(), biz: newBiz, owner: 'New Lead', signal: newSignal || 'Manual entry', priority: 2, val: parseFloat(newVal) || 0, status: 'new',
    }, ...prev]);
    setNewBiz(''); setNewSignal(''); setNewVal('');
  };

  const advanceStatus = (id) => {
    const ORDER = ['new', 'contacted', 'proposal', 'closed'];
    setLeads(prev => prev.map(l => l.id === id ? { ...l, status: ORDER[(ORDER.indexOf(l.status) + 1) % ORDER.length] } : l));
  };

  const totalVal = leads.reduce((a, l) => a + l.val, 0);
  const closedLeads = leads.filter(l => l.status === 'closed');

  return (
    <div className="page-container fade-in" style={{ '--void': 'var(--ink)', '--void-2': 'var(--ink-2)' }}>
      <p style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.2em', color: 'var(--gold)', marginBottom: 6, textTransform: 'uppercase' }}>
        ▦ BASHAM PROTOCOL
      </p>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 28 }}>
        <h1 className="font-display fade-in-2" style={{ fontSize: 36, fontWeight: 900, color: 'var(--gold)' }}>SIDE HUSTLE PROTOCOL</h1>
        <span className="badge badge-gold">B2B LEAD ENGINE</span>
      </div>

      {/* KPIs */}
      <div className="grid-4 fade-in-2" style={{ marginBottom: 24 }}>
        {[
          { l: 'TOTAL PIPELINE', v: `$${totalVal.toLocaleString()}`, c: 'var(--gold)' },
          { l: 'ACTIVE LEADS', v: leads.filter(l => l.status !== 'closed').length.toString(), c: 'var(--signal-green)' },
          { l: 'PRIORITY 1', v: leads.filter(l => l.priority === 1).length.toString(), c: '#ff6060' },
          { l: 'CLOSED / WON', v: closedLeads.length.toString(), c: 'var(--warm-white)' },
        ].map(({ l, v, c }) => (
          <div key={l} className="basham-card">
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 900, color: c }}>{v}</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.12em', color: '#5a5a40', marginTop: 4 }}>{l}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {['signals', 'scripts', 'add'].map(t => (
          <button key={t} className={`btn btn-sm ${tab === t ? 'btn-gold' : 'btn-outline'}`} onClick={() => setTab(t)}>
            {t.toUpperCase()}
          </button>
        ))}
      </div>

      {tab === 'signals' && (
        <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {leads.map(l => (
            <div key={l.id} className={`signal-card priority-${l.priority}`}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <span style={{ fontFamily: 'var(--font-display)', fontSize: 14, color: 'var(--warm-white)' }}>{l.biz}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: '#5a5a40', marginLeft: 8 }}>{l.owner}</span>
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700, color: 'var(--gold)' }}>
                    ${l.val.toLocaleString()}
                  </span>
                  <button
                    className="btn btn-sm"
                    style={{ background: 'transparent', border: `1px solid ${STATUS_COLORS[l.status]}`, color: STATUS_COLORS[l.status], padding: '3px 8px' }}
                    onClick={() => advanceStatus(l.id)}
                  >
                    {l.status.toUpperCase()}
                  </button>
                </div>
              </div>
              <div style={{ fontFamily: 'var(--font-manrope)', fontSize: 12, color: '#8a8a60', marginTop: 6 }}>{l.signal}</div>
            </div>
          ))}
        </div>
      )}

      {tab === 'scripts' && (
        <div className="fade-in">
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            {CALL_SCRIPTS.map((s, i) => (
              <button key={i} className={`btn btn-sm ${activeScript === i ? 'btn-gold' : 'btn-outline'}`} onClick={() => setActiveScript(i)}>
                {s.title}
              </button>
            ))}
          </div>
          <div className="basham-card">
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--gold)', letterSpacing: '0.15em', marginBottom: 14 }}>
              CALL SCRIPT: {CALL_SCRIPTS[activeScript].title.toUpperCase()}
            </p>
            {CALL_SCRIPTS[activeScript].lines.map((line, i) => (
              <div key={i} style={{ marginBottom: 14, padding: '10px 14px', borderRadius: 4, background: line.role === 'YOU' ? 'rgba(212,160,23,0.06)' : 'rgba(255,255,255,0.03)', borderLeft: `3px solid ${line.role === 'YOU' ? 'var(--gold)' : '#3a3a20'}` }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: line.role === 'YOU' ? 'var(--gold)' : '#5a5a40', marginBottom: 5, letterSpacing: '0.12em' }}>{line.role}</div>
                <div style={{ fontFamily: 'var(--font-manrope)', fontSize: 13, color: 'var(--warm-white)', lineHeight: 1.6 }}>{line.text}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'add' && (
        <div className="basham-card fade-in" style={{ maxWidth: 560 }}>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--gold)', letterSpacing: '0.15em', marginBottom: 14 }}>ADD LEAD</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label style={{ display: 'block', fontFamily: 'var(--font-mono)', fontSize: 9, color: '#5a5a40', marginBottom: 4, letterSpacing: '0.1em' }}>BUSINESS NAME</label>
              <input className="field field-gold" placeholder="Business name..." value={newBiz} onChange={e => setNewBiz(e.target.value)} />
            </div>
            <div>
              <label style={{ display: 'block', fontFamily: 'var(--font-mono)', fontSize: 9, color: '#5a5a40', marginBottom: 4, letterSpacing: '0.1em' }}>PAIN SIGNAL</label>
              <input className="field field-gold" placeholder="What's their problem?" value={newSignal} onChange={e => setNewSignal(e.target.value)} />
            </div>
            <div>
              <label style={{ display: 'block', fontFamily: 'var(--font-mono)', fontSize: 9, color: '#5a5a40', marginBottom: 4, letterSpacing: '0.1em' }}>POTENTIAL VALUE ($)</label>
              <input className="field field-gold" type="number" placeholder="0" value={newVal} onChange={e => setNewVal(e.target.value)} />
            </div>
            <button className="btn btn-gold" onClick={addLead} disabled={!newBiz.trim()} data-testid="add-lead-btn">
              ▦ ADD LEAD
            </button>
          </div>
        </div>
      )}

      <EarningsRouter sourcePage="side-hustle" title="Funnel Yield Harvester / lead revenue → multi-chain wallets" />
    </div>
  );
}
