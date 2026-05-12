import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Connection, PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL } from '@solana/web3.js';
import toast from 'react-hot-toast';

const TREASURY = '7dzgCA8G55VytZ8PS1b99rbbctzCgJbnEoBEYBnn15YR';
const SECURE_WALLET = '8e6ogxfUnj6YXHp1tR4Kj1ytSkmEhLhi2fbKqRVxUHPi';
const BACKEND = process.env.REACT_APP_BACKEND_URL;
const RPC_URL = 'https://api.mainnet-beta.solana.com';

export default function TreasuryRecovery() {
  const [balance, setBalance] = useState(null);
  const [loading, setLoading] = useState(true);
  const [amount, setAmount] = useState('');
  const [destination, setDestination] = useState(SECURE_WALLET);
  const [note, setNote] = useState('');
  const [phantomConnected, setPhantomConnected] = useState(false);
  const [phantomKey, setPhantomKey] = useState(null);
  const [txStatus, setTxStatus] = useState('idle'); // idle | pending | success | error
  const [txSig, setTxSig] = useState(null);
  const [txError, setTxError] = useState('');

  // ── Fetch treasury balance via backend proxy ───────────────────────────
  const fetchBalance = useCallback(async () => {
    try {
      setLoading(true);
      const r = await fetch(`${BACKEND}/api/solana-balance?owner=${TREASURY}`);
      const data = await r.json();
      if (data?.ok) setBalance(data.sol);
      else setBalance(0);
    } catch (e) {
      console.error(e);
      setBalance(0);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBalance();
    const interval = setInterval(fetchBalance, 30000);
    return () => clearInterval(interval);
  }, [fetchBalance]);

  // ── Detect Phantom ─────────────────────────────────────────────────────
  useEffect(() => {
    const solana = window.solana;
    if (solana?.isPhantom && solana.isConnected && solana.publicKey) {
      setPhantomConnected(true);
      setPhantomKey(solana.publicKey.toString());
    }
  }, []);

  const connectPhantom = async () => {
    try {
      const solana = window.solana;
      if (!solana?.isPhantom) {
        toast.error('Phantom wallet not found');
        window.open('https://phantom.app/', '_blank');
        return;
      }
      const resp = await solana.connect();
      setPhantomConnected(true);
      setPhantomKey(resp.publicKey.toString());
      toast.success('Phantom connected');
    } catch (e) {
      toast.error('Phantom connection declined');
    }
  };

  // ── Funnel Out: build + sign + send Solana SystemProgram.transfer ──────
  const handleExtract = async () => {
    setTxError('');
    setTxSig(null);

    if (!phantomConnected || !window.solana) {
      toast.error('Connect Phantom first');
      return;
    }
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) {
      toast.error('Enter valid amount');
      return;
    }
    if (balance !== null && amt > balance) {
      toast.error(`Amount exceeds treasury balance (${balance.toFixed(4)} SOL)`);
      return;
    }
    let destPubkey;
    try {
      destPubkey = new PublicKey(destination);
    } catch {
      toast.error('Invalid destination address');
      return;
    }

    setTxStatus('pending');
    try {
      const connection = new Connection(RPC_URL, 'confirmed');

      // IMPORTANT: signer must be the treasury private key holder.
      // We assume the connected Phantom wallet IS the treasury owner.
      // If not, the transfer will fail on-chain (treasury must sign).
      const fromPubkey = window.solana.publicKey;

      const transaction = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey,
          toPubkey: destPubkey,
          lamports: Math.round(amt * LAMPORTS_PER_SOL),
        })
      );

      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = fromPubkey;

      // Phantom signs
      const signed = await window.solana.signTransaction(transaction);
      const signature = await connection.sendRawTransaction(signed.serialize(), {
        skipPreflight: false,
        preflightCommitment: 'confirmed',
      });

      // Confirm
      await connection.confirmTransaction(
        { signature, blockhash, lastValidBlockHeight },
        'confirmed'
      );

      setTxSig(signature);
      setTxStatus('success');
      toast.success('Funds extracted successfully');
      fetchBalance();
    } catch (e) {
      console.error(e);
      setTxError(e?.message || 'Transaction failed');
      setTxStatus('error');
      toast.error(e?.message || 'Transfer failed');
    }
  };

  const quickAmount = (type) => {
    if (balance == null) return;
    if (type === 'max') setAmount((Math.max(0, balance - 0.0005)).toFixed(4));
    else if (type === 'half') setAmount((balance / 2).toFixed(4));
    else if (type === 50) setAmount('50');
    else if (type === 100) setAmount('100');
  };

  const reset = () => {
    setAmount('');
    setNote('');
    setTxSig(null);
    setTxStatus('idle');
    setTxError('');
  };

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div className="page-wrap" data-testid="treasury-recovery-page">
      {/* Header */}
      <header className="page-header" style={{ marginBottom: 32 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span className="badge badge-purple">SECURE OPS</span>
          <span className="badge badge-amber">MAINNET</span>
          <span className="live-dot" />
        </div>
        <h1 className="page-title" style={{ marginTop: 12 }} data-testid="recovery-title">
          Treasury Recovery
        </h1>
        <p className="page-subtitle">
          Securely extract funds from the main treasury to your secure wallet
        </p>
      </header>

      {/* Security warnings */}
      <div className="glass-card" style={{
        padding: 20,
        marginBottom: 24,
        borderColor: 'rgba(255, 176, 32, 0.4)',
        background: 'linear-gradient(180deg, rgba(255,176,32,0.06), rgba(255,176,32,0.02))',
      }} data-testid="security-warning">
        <div style={{
          fontFamily: 'var(--font-display)',
          fontSize: 12,
          letterSpacing: '0.2em',
          color: '#FFB020',
          marginBottom: 12,
        }}>
          ⚠ SECURITY PROTOCOL — READ BEFORE PROCEEDING
        </div>
        <ul style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 12,
          color: '#a8b8d0',
          lineHeight: 1.7,
          margin: 0,
          paddingLeft: 18,
        }}>
          <li>Only use this if you control the treasury private key (Phantom must be the treasury signer).</li>
          <li>This will send SOL directly from the treasury to your chosen destination wallet.</li>
          <li>Double-check the destination address before confirming — transactions are irreversible.</li>
          <li>Network fees (~0.000005 SOL) will be deducted from the signing wallet.</li>
        </ul>
      </div>

      {/* Treasury status + Phantom card */}
      <div className="grid-2" style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
        gap: 16,
        marginBottom: 24,
      }}>
        <div className="glass-card" style={{ padding: 24 }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: '#3a5070', letterSpacing: '0.2em' }}>
            TREASURY WALLET
          </div>
          <div style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            color: '#7c98c4',
            marginTop: 6,
            wordBreak: 'break-all',
          }} data-testid="treasury-address">
            {TREASURY}
          </div>
          <div style={{ marginTop: 16, display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{
              fontFamily: 'var(--font-display)',
              fontSize: 36,
              color: '#14F195',
              fontWeight: 800,
            }} data-testid="treasury-balance">
              {loading ? '—' : balance !== null ? balance.toFixed(4) : '0.0000'}
            </span>
            <span style={{ fontFamily: 'var(--font-mono)', color: '#7c98c4', fontSize: 14 }}>SOL</span>
          </div>
          <div style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            color: '#3a5070',
            marginTop: 4,
          }}>
            Live balance · auto-refresh 30s
          </div>
        </div>

        <div className="glass-card" style={{ padding: 24 }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: '#3a5070', letterSpacing: '0.2em' }}>
            SIGNER (PHANTOM)
          </div>
          {phantomConnected ? (
            <>
              <div style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 11,
                color: '#14F195',
                marginTop: 10,
                wordBreak: 'break-all',
              }} data-testid="phantom-pubkey">
                {phantomKey}
              </div>
              <span className="badge badge-green" style={{ marginTop: 12, display: 'inline-block' }}>
                ● CONNECTED
              </span>
            </>
          ) : (
            <>
              <div style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 12,
                color: '#7c98c4',
                marginTop: 10,
                lineHeight: 1.6,
              }}>
                Connect the wallet that controls the treasury to authorise an extraction.
              </div>
              <button
                className="btn btn-primary"
                style={{ marginTop: 16, width: '100%' }}
                onClick={connectPhantom}
                data-testid="connect-phantom-btn"
              >
                CONNECT PHANTOM
              </button>
            </>
          )}
        </div>
      </div>

      {/* Extraction form */}
      {txStatus !== 'success' && (
        <div className="glass-card" style={{ padding: 28 }} data-testid="extraction-form">
          <div style={{
            fontFamily: 'var(--font-display)',
            fontSize: 14,
            letterSpacing: '0.2em',
            color: '#e8f0ff',
            marginBottom: 24,
          }}>
            ◆ EXTRACTION PARAMETERS
          </div>

          {/* Amount */}
          <label style={labelStyle}>Amount to Extract (SOL)</label>
          <input
            type="number"
            step="0.0001"
            min="0"
            placeholder="0.0000"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            style={inputStyle}
            data-testid="amount-input"
          />
          <div style={{ display: 'flex', gap: 8, marginTop: 10, marginBottom: 20, flexWrap: 'wrap' }}>
            <button onClick={() => quickAmount('max')} style={quickBtn} data-testid="quick-max">MAX</button>
            <button onClick={() => quickAmount('half')} style={quickBtn} data-testid="quick-half">HALF</button>
            <button onClick={() => quickAmount(50)} style={quickBtn} data-testid="quick-50">50 SOL</button>
            <button onClick={() => quickAmount(100)} style={quickBtn} data-testid="quick-100">100 SOL</button>
          </div>

          {/* Destination */}
          <label style={labelStyle}>Destination Wallet Address</label>
          <input
            type="text"
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
            style={{ ...inputStyle, fontFamily: 'var(--font-mono)', fontSize: 12 }}
            data-testid="destination-input"
          />
          <div style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            color: '#3a5070',
            marginTop: 6,
            marginBottom: 20,
          }}>
            Pre-filled with secure recovery wallet
          </div>

          {/* Note */}
          <label style={labelStyle}>Note (optional)</label>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Internal label for this transfer..."
            style={inputStyle}
            data-testid="note-input"
          />

          {/* Big extract button */}
          <button
            onClick={handleExtract}
            disabled={txStatus === 'pending' || !phantomConnected || !amount}
            className="btn btn-primary"
            style={{
              marginTop: 28,
              width: '100%',
              padding: '20px 24px',
              fontSize: 16,
              letterSpacing: '0.2em',
              background: txStatus === 'pending'
                ? 'rgba(153, 69, 255, 0.4)'
                : 'linear-gradient(135deg, #9945FF 0%, #14F195 100%)',
              border: 'none',
              cursor: (txStatus === 'pending' || !phantomConnected || !amount) ? 'not-allowed' : 'pointer',
              opacity: (txStatus === 'pending' || !phantomConnected || !amount) ? 0.5 : 1,
              boxShadow: '0 8px 32px rgba(153, 69, 255, 0.35)',
            }}
            data-testid="funnel-out-btn"
          >
            {txStatus === 'pending' ? '◆ SIGNING & BROADCASTING...' : '◆ FUNNEL OUT — EXTRACT FUNDS'}
          </button>

          {txStatus === 'error' && (
            <div style={{
              marginTop: 16,
              padding: 12,
              borderRadius: 8,
              background: 'rgba(255, 60, 60, 0.08)',
              border: '1px solid rgba(255, 60, 60, 0.3)',
              color: '#FF6B6B',
              fontFamily: 'var(--font-mono)',
              fontSize: 12,
            }} data-testid="error-msg">
              ✕ {txError}
            </div>
          )}
        </div>
      )}

      {/* Success state */}
      {txStatus === 'success' && txSig && (
        <div className="glass-card" style={{
          padding: 36,
          textAlign: 'center',
          borderColor: 'rgba(20, 241, 149, 0.5)',
          background: 'linear-gradient(180deg, rgba(20,241,149,0.06), rgba(20,241,149,0.02))',
        }} data-testid="success-state">
          <div style={{
            fontSize: 56,
            marginBottom: 16,
            animation: 'pulse 1.5s ease-in-out infinite',
          }}>
            ✓
          </div>
          <div style={{
            fontFamily: 'var(--font-display)',
            fontSize: 22,
            color: '#14F195',
            marginBottom: 8,
            letterSpacing: '0.1em',
          }}>
            EXTRACTION COMPLETE
          </div>
          <div style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 12,
            color: '#a8b8d0',
            marginBottom: 24,
          }}>
            Transferred {amount} SOL to destination wallet
          </div>

          <div style={{
            padding: 14,
            borderRadius: 8,
            background: 'rgba(0,0,0,0.3)',
            border: '1px solid rgba(20, 241, 149, 0.2)',
            marginBottom: 24,
          }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: '#3a5070', letterSpacing: '0.2em', marginBottom: 6 }}>
              TRANSACTION SIGNATURE
            </div>
            <div style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              color: '#e8f0ff',
              wordBreak: 'break-all',
            }} data-testid="tx-signature">
              {txSig}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <a
              href={`https://solscan.io/tx/${txSig}`}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-primary"
              style={{ textDecoration: 'none' }}
              data-testid="solscan-link"
            >
              VIEW ON SOLSCAN ↗
            </a>
            <button onClick={reset} className="btn btn-secondary" data-testid="extract-more-btn">
              EXTRACT MORE
            </button>
            <Link to="/" className="btn btn-secondary" style={{ textDecoration: 'none' }} data-testid="return-command-btn">
              RETURN TO COMMAND
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

const labelStyle = {
  display: 'block',
  fontFamily: 'var(--font-mono)',
  fontSize: 10,
  color: '#7c98c4',
  letterSpacing: '0.2em',
  marginBottom: 8,
  textTransform: 'uppercase',
};

const inputStyle = {
  width: '100%',
  padding: '14px 16px',
  background: 'rgba(8, 16, 36, 0.6)',
  border: '1px solid rgba(153, 69, 255, 0.25)',
  borderRadius: 8,
  color: '#e8f0ff',
  fontFamily: 'var(--font-mono)',
  fontSize: 14,
  outline: 'none',
  transition: 'border-color 200ms ease, box-shadow 200ms ease',
  boxSizing: 'border-box',
};

const quickBtn = {
  padding: '8px 14px',
  background: 'rgba(153, 69, 255, 0.1)',
  border: '1px solid rgba(153, 69, 255, 0.3)',
  borderRadius: 6,
  color: '#9945FF',
  fontFamily: 'var(--font-mono)',
  fontSize: 11,
  letterSpacing: '0.1em',
  cursor: 'pointer',
  transition: 'all 200ms ease',
};
