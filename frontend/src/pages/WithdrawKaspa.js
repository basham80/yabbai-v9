import React, { useEffect, useState, useCallback } from 'react';
import toast from 'react-hot-toast';

const BACKEND = process.env.REACT_APP_BACKEND_URL;
const SOL_EARNINGS_WALLET = 'HKjCGdas7CVkSwQHi6Bhckj2U2P8rtTyMbikdY5pkXcb';
const ADDR_KEY = 'yabbai_kaspa_address';

/**
 * Withdraw KAS — uses the Kasware browser extension (https://kasware.xyz) for signing.
 * Path A: Send KAS to any address (Kasware UX)
 * Path B: Convert KAS → SOL/USDC via SimpleSwap (no-KYC bridge)
 *
 * IMPORTANT: This page NEVER asks for or transmits seed phrases. All signing
 * happens inside the Kasware extension on the user's machine.
 */
export default function WithdrawKaspa() {
  const [tab, setTab] = useState('send'); // 'send' | 'swap' | 'history'

  // Kasware detection
  const [kaswareAvailable, setKaswareAvailable] = useState(false);
  const [kasAddr, setKasAddr] = useState(() => localStorage.getItem(ADDR_KEY) || '');
  const [kasBal, setKasBal] = useState(null);

  // Send form
  const [sendTo, setSendTo] = useState('');
  const [sendAmount, setSendAmount] = useState('');
  const [sending, setSending] = useState(false);

  // Swap form
  const [swapAmount, setSwapAmount] = useState('');
  const [swapTarget, setSwapTarget] = useState('sol');
  const [swapDest, setSwapDest] = useState('');
  const [quote, setQuote] = useState(null);
  const [swapping, setSwapping] = useState(false);
  const [activeExchange, setActiveExchange] = useState(null);

  const [history, setHistory] = useState([]);

  // Detect Kasware
  useEffect(() => {
    const detect = () => {
      const has = !!(window.kasware && typeof window.kasware === 'object');
      setKaswareAvailable(has);
    };
    detect();
    const id = setTimeout(detect, 800); // give Kasware time to inject
    return () => clearTimeout(id);
  }, []);

  const connectKasware = async () => {
    if (!window.kasware) { toast.error('Install Kasware extension first'); return; }
    try {
      const accounts = await window.kasware.requestAccounts();
      const addr = accounts[0];
      setKasAddr(addr);
      localStorage.setItem(ADDR_KEY, addr);
      const bal = await window.kasware.getBalance();
      setKasBal(bal);
      toast.success('Kasware connected');
    } catch (e) {
      toast.error(e?.message || 'Kasware connection rejected');
    }
  };

  const refreshBalance = async () => {
    if (window.kasware) {
      try {
        const bal = await window.kasware.getBalance();
        setKasBal(bal);
      } catch {}
    }
  };

  // Path A: Send KAS via Kasware
  const sendKas = async () => {
    if (!window.kasware) { toast.error('Kasware not detected'); return; }
    if (!sendTo || !sendTo.startsWith('kaspa:')) { toast.error('Recipient must be a kaspa: address'); return; }
    const amt = parseFloat(sendAmount);
    if (!amt || amt <= 0) { toast.error('Enter KAS amount > 0'); return; }
    setSending(true);
    try {
      // Kasware sendKaspa expects amount in sompi (1 KAS = 100,000,000 sompi)
      const sompi = Math.round(amt * 1e8);
      const txid = await window.kasware.sendKaspa(sendTo, sompi);
      toast.success(`Sent · tx ${String(txid).slice(0, 12)}…`);
      setSendTo(''); setSendAmount('');
      refreshBalance();
    } catch (e) {
      toast.error(e?.message || 'Send rejected');
    } finally {
      setSending(false);
    }
  };

  // Path B: KAS → SOL swap via SimpleSwap
  const getQuote = useCallback(async () => {
    const amt = parseFloat(swapAmount);
    if (!amt || amt <= 0) { setQuote(null); return; }
    try {
      const r = await fetch(`${BACKEND}/api/swap/kaspa/quote?amountKas=${amt}&targetCurrency=${swapTarget}`);
      const d = await r.json();
      setQuote(d);
    } catch (e) {
      setQuote({ ok: false, error: e.message });
    }
  }, [swapAmount, swapTarget]);

  useEffect(() => {
    if (swapAmount) {
      const id = setTimeout(getQuote, 400);
      return () => clearTimeout(id);
    }
  }, [swapAmount, swapTarget, getQuote]);

  const initiateSwap = async () => {
    if (!quote?.ok) { toast.error('Get a valid quote first'); return; }
    if (!swapDest || swapDest.length < 30) { toast.error('Enter destination address'); return; }
    setSwapping(true);
    try {
      const r = await fetch(`${BACKEND}/api/swap/kaspa/initiate`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amountKas: parseFloat(swapAmount),
          targetCurrency: swapTarget,
          destinationAddress: swapDest,
          refundKaspaAddress: kasAddr,
        }),
      });
      const d = await r.json();
      if (d.ok) {
        setActiveExchange(d);
        toast.success('Exchange created · send KAS to deposit address');
        loadHistory();
      } else {
        toast.error(d.error || 'Failed to create exchange');
      }
    } catch (e) {
      toast.error(e.message);
    } finally {
      setSwapping(false);
    }
  };

  const oneClickSwapSend = async () => {
    if (!activeExchange?.kaspaDeposit) return;
    if (!window.kasware) { toast.error('Kasware not detected — copy the deposit address and send manually'); return; }
    try {
      const sompi = Math.round(parseFloat(swapAmount) * 1e8);
      const txid = await window.kasware.sendKaspa(activeExchange.kaspaDeposit, sompi);
      toast.success(`KAS sent to swap · ${String(txid).slice(0, 12)}…`);
      refreshExchangeStatus();
    } catch (e) {
      toast.error(e?.message || 'Send rejected');
    }
  };

  const refreshExchangeStatus = async () => {
    if (!activeExchange?.exchangeId) return;
    try {
      const r = await fetch(`${BACKEND}/api/swap/kaspa/status/${activeExchange.exchangeId}`);
      const d = await r.json();
      if (d.ok) {
        setActiveExchange(e => ({ ...e, status: d.status, txTo: d.txTo, txFrom: d.txFrom }));
      }
    } catch {}
  };

  const loadHistory = useCallback(async () => {
    try {
      const r = await fetch(`${BACKEND}/api/swap/kaspa/history?limit=15`);
      const d = await r.json();
      if (d.ok) setHistory(d.items || []);
    } catch {}
  }, []);
  useEffect(() => { loadHistory(); }, [loadHistory]);

  return (
    <div className="page-container fade-in">
      <p className="section-label fade-in-1">⚡ WITHDRAW · KASPA (KAS)</p>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <h1 className="font-display fade-in-2" style={{ fontSize: 36, fontWeight: 900, color: '#14F195' }}>SEND KAS</h1>
        {kaswareAvailable
          ? <span className="badge badge-green">KASWARE DETECTED</span>
          : <span className="badge badge-amber">KASWARE NOT FOUND</span>}
      </div>

      {/* Honest disclosure */}
      <div className="card" style={{ marginBottom: 20, background: 'linear-gradient(135deg, rgba(20,241,149,0.05), rgba(20,241,149,0.01))', borderColor: 'rgba(20,241,149,0.22)' }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#14F195', letterSpacing: '0.18em', marginBottom: 6 }}>● HOW THIS WORKS</div>
        <p style={{ fontSize: 12, color: '#e8f0ff', lineHeight: 1.55 }}>
          All signing happens locally in your <a href="https://kasware.xyz" target="_blank" rel="noopener noreferrer" style={{ color: '#14F195' }}>Kasware browser extension</a>.
          Your seed phrase and private keys NEVER touch this website's backend. If you haven't yet, install Kasware, import your seed, then
          come back here. <b>Path B</b> uses ChangeNOW to convert KAS → SOL/USDC/USDT/ETH/BTC and routes the output to a Solana wallet you choose.
        </p>
        {!kaswareAvailable && (
          <a href="https://kasware.xyz" target="_blank" rel="noopener noreferrer" className="btn btn-green btn-sm" style={{ textDecoration: 'none', marginTop: 10, display: 'inline-block' }}>
            INSTALL KASWARE →
          </a>
        )}
      </div>

      {/* Wallet status */}
      <div className="card" style={{ marginBottom: 18 }} data-testid="kaspa-wallet-status">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: '#7c98c4', letterSpacing: '0.2em' }}>KASWARE WALLET</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: '#e8f0ff', wordBreak: 'break-all', marginTop: 4 }}>
              {kasAddr || 'Not connected'}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            {kasBal && (
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 900, color: '#14F195' }}>
                  {((kasBal.confirmed || 0) / 1e8).toFixed(4)} KAS
                </div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#7c98c4' }}>CONFIRMED BALANCE</div>
              </div>
            )}
            {!kasAddr ? (
              <button onClick={connectKasware} disabled={!kaswareAvailable} className="btn btn-green" data-testid="connect-kasware-btn">
                CONNECT KASWARE
              </button>
            ) : (
              <button onClick={refreshBalance} className="btn btn-outline btn-sm" data-testid="refresh-kas-balance">REFRESH</button>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 18 }}>
        {[
          { id: 'send', label: '▸ SEND KAS' },
          { id: 'swap', label: '⟳ KAS → SOL/USDC' },
          { id: 'history', label: '◫ EXCHANGE HISTORY' },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} data-testid={`tab-${t.id}`}
            className={`btn btn-sm ${tab === t.id ? 'btn-primary' : 'btn-outline'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab: SEND */}
      {tab === 'send' && (
        <div className="card" data-testid="send-kas-card">
          <p className="section-label" style={{ marginBottom: 12 }}>SEND KAS TO ADDRESS</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 14 }}>
            <div>
              <label className="stat-label">RECIPIENT (kaspa:…)</label>
              <input value={sendTo} onChange={e => setSendTo(e.target.value.trim())} placeholder="kaspa:qz0…"
                style={inp} data-testid="send-to-input" />
            </div>
            <div>
              <label className="stat-label">AMOUNT (KAS)</label>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input type="number" step="0.0001" min="0" value={sendAmount} onChange={e => setSendAmount(e.target.value)}
                  placeholder="0.0000" style={{ ...inp, flex: 1 }} data-testid="send-amount-input" />
                {kasBal && (
                  <button onClick={() => setSendAmount(((kasBal.confirmed || 0) / 1e8).toString())}
                    className="btn btn-sm btn-outline" data-testid="send-max-btn">MAX</button>
                )}
              </div>
            </div>
          </div>
          <button onClick={sendKas} disabled={sending || !kasAddr} className="btn btn-green" style={{ width: '100%' }} data-testid="execute-send-kas-btn">
            {sending ? 'SIGNING IN KASWARE…' : `► SEND ${sendAmount || '0'} KAS`}
          </button>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: '#7c98c4', marginTop: 8 }}>
            Kasware will pop up to confirm. Tx broadcasts to Kaspa mainnet directly.
          </p>
        </div>
      )}

      {/* Tab: SWAP */}
      {tab === 'swap' && (
        <div className="card" data-testid="swap-kas-card">
          <p className="section-label" style={{ marginBottom: 12 }}>CONVERT KAS → SOL / USDC / USDT / ETH / BTC</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
            <div>
              <label className="stat-label">AMOUNT (KAS)</label>
              <input type="number" step="0.01" min="0" value={swapAmount} onChange={e => setSwapAmount(e.target.value)}
                placeholder="10.00" style={inp} data-testid="swap-amount-input" />
            </div>
            <div>
              <label className="stat-label">TARGET</label>
              <select value={swapTarget} onChange={e => setSwapTarget(e.target.value)} style={inp} data-testid="swap-target-select">
                <option value="sol">SOL · Solana</option>
                <option value="usdc">USDC · Solana</option>
                <option value="usdt">USDT · TRC20</option>
                <option value="eth">ETH · Ethereum</option>
                <option value="btc">BTC · Bitcoin</option>
              </select>
            </div>
          </div>
          <div style={{ marginBottom: 12 }}>
            <label className="stat-label">DESTINATION ADDRESS ({swapTarget.toUpperCase()})</label>
            <input value={swapDest} onChange={e => setSwapDest(e.target.value.trim())}
              placeholder={swapTarget === 'sol' || swapTarget === 'usdc' ? SOL_EARNINGS_WALLET : 'paste destination address'}
              style={inp} data-testid="swap-dest-input" />
            <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
              {(swapTarget === 'sol' || swapTarget === 'usdc') && (
                <button onClick={() => setSwapDest(SOL_EARNINGS_WALLET)}
                  className="btn btn-sm btn-outline" data-testid="use-earnings-wallet-btn">USE EARNINGS WALLET</button>
              )}
            </div>
          </div>

          {/* Quote display */}
          {quote && (
            <div style={{
              padding: 12, borderRadius: 6, marginBottom: 12,
              background: quote.ok ? 'rgba(20,241,149,0.06)' : 'rgba(245,166,35,0.06)',
              border: `1px solid ${quote.ok ? 'rgba(20,241,149,0.25)' : 'rgba(245,166,35,0.25)'}`,
            }} data-testid="quote-display">
              {quote.ok ? (
                <>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#14F195' }}>
                    ● LIVE QUOTE (SimpleSwap)
                  </div>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 900, color: '#e8f0ff', marginTop: 4 }}>
                    {quote.fromAmount.toFixed(4)} KAS → <span style={{ color: '#14F195' }}>{quote.toAmount.toFixed(6)}</span> {quote.toCurrency}
                  </div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: '#7c98c4', marginTop: 4 }}>
                    Rate: 1 KAS = {quote.rate.toFixed(8)} {quote.toCurrency}
                    {quote.minAmount && ` · min ${quote.minAmount} KAS`}
                  </div>
                </>
              ) : (
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#F5A623' }}>
                  ⚠ {quote.error}
                </div>
              )}
            </div>
          )}

          <button onClick={initiateSwap} disabled={swapping || !quote?.ok || !swapDest} className="btn btn-green" style={{ width: '100%' }} data-testid="initiate-swap-btn">
            {swapping ? 'CREATING EXCHANGE…' : 'INITIATE SWAP'}
          </button>

          {/* Active exchange */}
          {activeExchange && (
            <div style={{ marginTop: 14, padding: 14, background: 'rgba(153,69,255,0.06)', border: '1px solid rgba(153,69,255,0.25)', borderRadius: 8 }} data-testid="active-exchange">
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#b890ff', letterSpacing: '0.16em', marginBottom: 8 }}>
                ◆ EXCHANGE #{activeExchange.exchangeId} · {(activeExchange.status || 'waiting').toUpperCase()}
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#e8f0ff', lineHeight: 1.7 }}>
                Send <b style={{ color: '#14F195' }}>{activeExchange.amountKas} KAS</b> to:
              </div>
              <div style={{
                fontFamily: 'var(--font-mono)', fontSize: 12, color: '#14F195',
                background: 'rgba(8,16,36,0.6)', padding: '10px 12px', borderRadius: 4,
                wordBreak: 'break-all', marginTop: 6,
              }} data-testid="swap-deposit-address">
                {activeExchange.kaspaDeposit}
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
                <button onClick={() => { navigator.clipboard.writeText(activeExchange.kaspaDeposit); toast.success('Deposit address copied'); }}
                  className="btn btn-sm btn-outline" data-testid="copy-deposit-addr">COPY ADDRESS</button>
                {kaswareAvailable && (
                  <button onClick={oneClickSwapSend} className="btn btn-green btn-sm" data-testid="oneclick-send-swap">
                    ► SEND VIA KASWARE
                  </button>
                )}
                <button onClick={refreshExchangeStatus} className="btn btn-sm btn-outline" data-testid="refresh-exchange">REFRESH STATUS</button>
              </div>
              {activeExchange.txTo && (
                <div style={{ marginTop: 10, fontFamily: 'var(--font-mono)', fontSize: 10, color: '#14F195' }}>
                  ✓ Output tx: <a href={`https://solscan.io/tx/${activeExchange.txTo}`} target="_blank" rel="noopener noreferrer" style={{ color: '#b890ff' }}>{String(activeExchange.txTo).slice(0, 16)}…</a>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Tab: HISTORY */}
      {tab === 'history' && (
        <div className="card" data-testid="exchange-history-card">
          <p className="section-label" style={{ marginBottom: 12 }}>EXCHANGE HISTORY</p>
          {history.length === 0 ? (
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#7c98c4' }}>No exchanges yet.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {history.map(h => (
                <div key={h.exchangeId} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.4fr) 1fr 1fr 1fr', gap: 10, padding: '8px 10px', borderRadius: 4, background: 'rgba(8,16,36,0.4)', fontFamily: 'var(--font-mono)', fontSize: 11, alignItems: 'center' }}>
                  <span style={{ color: '#b890ff' }}>#{h.exchangeId}</span>
                  <span style={{ color: '#14F195' }}>{h.amountKas} KAS → {h.expectedOut} {String(h.targetCurrency).toUpperCase()}</span>
                  <span style={{ color: h.status === 'finished' ? '#14F195' : '#F5A623' }}>{(h.status || 'waiting').toUpperCase()}</span>
                  <span style={{ color: '#7c98c4', fontSize: 10 }}>{new Date(h.createdAt).toLocaleString()}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const inp = {
  width: '100%', padding: '10px 12px',
  background: 'rgba(8, 16, 36, 0.6)',
  border: '1px solid rgba(20, 241, 149, 0.25)',
  borderRadius: 6, color: '#e8f0ff',
  fontFamily: 'var(--font-mono)', fontSize: 13, outline: 'none',
  boxSizing: 'border-box',
};
