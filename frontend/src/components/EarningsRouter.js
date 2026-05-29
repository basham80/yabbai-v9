import React, { useEffect, useState, useCallback } from 'react';
import { Connection, PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL } from '@solana/web3.js';
import toast from 'react-hot-toast';

const BACKEND = process.env.REACT_APP_BACKEND_URL;
const RPC_URL = 'https://api.mainnet-beta.solana.com';

const CHAIN_THEME = {
  solana:   { color: '#14F195', bg: 'rgba(20,241,149,0.07)',  border: 'rgba(20,241,149,0.25)' },
  ethereum: { color: '#627eea', bg: 'rgba(98,126,234,0.07)',  border: 'rgba(98,126,234,0.25)' },
  bitcoin:  { color: '#F7931A', bg: 'rgba(247,147,26,0.07)',  border: 'rgba(247,147,26,0.25)' },
  sui:      { color: '#4DA2FF', bg: 'rgba(77,162,255,0.07)',  border: 'rgba(77,162,255,0.25)' },
};

function shorten(addr, n = 6) {
  if (!addr) return '';
  return addr.length > n * 2 + 2 ? `${addr.slice(0, n)}…${addr.slice(-n)}` : addr;
}

function qrUrl(text, size = 140) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(text)}&bgcolor=050c1a&color=00f0ff&qzone=2`;
}

/**
 * EarningsRouter — drop into ANY page (Basham, Mission, SideHustle, Agent, etc.)
 *   <EarningsRouter sourcePage="basham" connectedWallet={phantomPubkey} compact />
 *
 * - Shows live balances + USD values for the 4 destination wallets
 * - For SOL: signed Phantom funnel button (real on-chain transfer)
 * - For ETH/BTC/SUI: receive-address card with QR + copy
 */
export default function EarningsRouter({ sourcePage, connectedWallet = null, compact = false, title = null }) {
  const [data, setData] = useState({ destinations: [], totalUsd: 0 });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [funnelAmount, setFunnelAmount] = useState('');

  const refresh = useCallback(async () => {
    try {
      const r = await fetch(`${BACKEND}/api/earnings/destinations`);
      const d = await r.json();
      if (d.ok) setData({ destinations: d.destinations, totalUsd: d.totalUsd });
    } catch (e) {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 30000);
    return () => clearInterval(id);
  }, [refresh]);

  const solDest = data.destinations.find(x => x.chain === 'solana');

  const funnelSol = async () => {
    if (!window.solana?.isPhantom) { toast.error('Phantom wallet not detected'); return; }
    if (!solDest) { toast.error('SOL destination not configured'); return; }
    setBusy(true);
    try {
      const s = window.solana;
      if (!s.isConnected || !s.publicKey) {
        await s.connect();
      }
      const fromPubkey = s.publicKey;
      // Get max sweep amount from backend (handles rent/fee buffer)
      const q = await fetch(`${BACKEND}/api/earnings/sol-funnel-quote`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fromOwner: fromPubkey.toString(),
          amountSol: funnelAmount ? parseFloat(funnelAmount) : null,
        }),
      });
      const quote = await q.json();
      if (!quote.ok) { toast.error(quote.error || 'Quote failed'); setBusy(false); return; }

      const amount = quote.amountSol;
      const lamports = Math.floor(amount * LAMPORTS_PER_SOL);
      const toPubkey = new PublicKey(quote.destination);

      const connection = new Connection(RPC_URL, 'confirmed');
      const tx = new Transaction().add(
        SystemProgram.transfer({ fromPubkey, toPubkey, lamports })
      );
      const { blockhash } = await connection.getLatestBlockhash('confirmed');
      tx.recentBlockhash = blockhash;
      tx.feePayer = fromPubkey;

      const signed = await s.signTransaction(tx);
      const sig = await connection.sendRawTransaction(signed.serialize(), { skipPreflight: false });
      await connection.confirmTransaction(sig, 'confirmed');

      await fetch(`${BACKEND}/api/earnings/record`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          signature: sig,
          sourcePage,
          chain: 'solana',
          amount,
          fromOwner: fromPubkey.toString(),
          destination: quote.destination,
        }),
      }).catch(() => {});

      toast.success(`Funneled ${amount.toFixed(4)} SOL → earnings wallet`);
      setFunnelAmount('');
      refresh();
    } catch (e) {
      toast.error(e?.message || 'Transfer failed');
    } finally {
      setBusy(false);
    }
  };

  const copy = (addr) => {
    navigator.clipboard.writeText(addr);
    toast.success('Address copied');
  };

  return (
    <div className="glass-card" style={{ padding: compact ? 18 : 22, marginTop: 16 }} data-testid={`earnings-router-${sourcePage}`}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.28em', color: '#7c98c4' }}>● EARNINGS ROUTER</div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 15, color: '#e8f0ff', marginTop: 4 }}>
            {title || 'Route earnings to YabbAI multi-chain wallets'}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: '#7c98c4' }}>TOTAL VALUE</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 16, color: '#14F195', fontWeight: 800 }} data-testid="earnings-total-usd">
            {loading ? '…' : `$${data.totalUsd.toFixed(2)}`}
          </div>
        </div>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: compact ? 'repeat(auto-fit, minmax(220px, 1fr))' : 'repeat(auto-fit, minmax(260px, 1fr))',
        gap: 10,
      }}>
        {data.destinations.map(d => {
          const t = CHAIN_THEME[d.chain] || CHAIN_THEME.solana;
          return (
            <div key={d.chain} data-testid={`earnings-card-${d.chain}`} style={{
              padding: 12, borderRadius: 8,
              background: t.bg,
              border: `1px solid ${t.border}`,
              display: 'flex', flexDirection: 'column', gap: 8,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: t.color, fontWeight: 800, letterSpacing: '0.16em' }}>
                  {d.symbol}
                </span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: '#7c98c4' }}>
                  {d.signable_from_phantom ? 'PHANTOM SIGNABLE' : 'RECEIVE-ONLY'}
                </span>
              </div>
              <div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 14, color: '#e8f0ff', fontWeight: 700 }}>
                  {loading ? '…' : `${d.balance.toFixed(d.chain === 'bitcoin' ? 8 : 4)} ${d.symbol}`}
                </div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: t.color }}>
                  {loading ? '' : `≈ $${(d.usdValue || 0).toFixed(2)}`}
                </div>
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: '#b890ff', wordBreak: 'break-all' }}>
                {shorten(d.address, 8)}
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <button onClick={() => copy(d.address)} className="btn btn-sm btn-outline" data-testid={`copy-${d.chain}`}>COPY</button>
                <a href={d.explorer} target="_blank" rel="noopener noreferrer" className="btn btn-sm btn-outline" style={{ textDecoration: 'none' }} data-testid={`explorer-${d.chain}`}>EXPLORER ↗</a>
              </div>
            </div>
          );
        })}
      </div>

      {/* SOL Manual Funnel — signed via Phantom */}
      {solDest && (
        <div style={{
          marginTop: 14, padding: 14,
          background: 'linear-gradient(135deg, rgba(20,241,149,0.05), rgba(20,241,149,0.02))',
          border: '1px solid rgba(20,241,149,0.25)',
          borderRadius: 8,
        }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.18em', color: '#14F195', marginBottom: 8 }}>
            ◆ MANUAL TRANSFER · SOL EARNINGS
          </div>
          <p style={{ fontSize: 11, color: '#7c98c4', fontFamily: 'var(--font-mono)', lineHeight: 1.5, marginBottom: 10 }}>
            Funnels SOL from your connected Phantom wallet straight to <b style={{ color: '#14F195' }}>{shorten(solDest.address, 10)}</b>. Leave amount empty to sweep max (minus rent/fee buffer).
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <input
              type="number" step="0.001" min="0" placeholder="amount (SOL) — blank for max"
              value={funnelAmount} onChange={e => setFunnelAmount(e.target.value)}
              style={{
                flex: 1, minWidth: 220,
                padding: '10px 12px',
                background: 'rgba(8,16,36,0.6)',
                border: '1px solid rgba(20,241,149,0.25)',
                borderRadius: 6, color: '#e8f0ff',
                fontFamily: 'var(--font-mono)', fontSize: 13, outline: 'none', boxSizing: 'border-box',
              }}
              data-testid="funnel-amount-input"
            />
            <button onClick={funnelSol} disabled={busy} className="btn btn-primary" data-testid="funnel-sol-btn">
              {busy ? 'SIGNING…' : 'FUNNEL SOL → EARNINGS'}
            </button>
          </div>
        </div>
      )}

      {/* ETH/BTC/SUI receive-only block with QR codes */}
      {!compact && (
        <details style={{ marginTop: 12 }}>
          <summary style={{ cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: 11, color: '#b890ff', letterSpacing: '0.12em' }}>
            ▸ ETH / BTC / SUI receive addresses (manual transfer from external wallets)
          </summary>
          <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
            {data.destinations.filter(d => !d.signable_from_phantom).map(d => (
              <div key={d.chain} style={{ display: 'flex', gap: 12, padding: 10, borderRadius: 8, background: 'rgba(8,16,36,0.45)', border: '1px solid rgba(124,152,196,0.18)' }}>
                <img src={qrUrl(d.address)} alt={`${d.symbol} QR`} width={140} height={140} style={{ borderRadius: 4 }} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, justifyContent: 'center' }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: CHAIN_THEME[d.chain].color, fontWeight: 700 }}>{d.symbol}</span>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: '#e8f0ff', wordBreak: 'break-all' }}>
                    {d.address}
                  </div>
                  <button onClick={() => copy(d.address)} className="btn btn-sm btn-outline" style={{ marginTop: 4 }}>COPY ADDRESS</button>
                </div>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
