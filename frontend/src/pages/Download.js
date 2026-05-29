import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';

export default function Download() {
  const [installable, setInstallable] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [platform, setPlatform] = useState('web');

  useEffect(() => {
    const ua = navigator.userAgent || '';
    if (/Android/i.test(ua)) setPlatform('android');
    else if (/iPhone|iPad|iPod/i.test(ua)) setPlatform('ios');
    else setPlatform('desktop');

    const handler = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setInstallable(true);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const install = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    setInstallable(false);
  };

  const Card = ({ icon, label, sub, status, children, testid }) => (
    <div className="card" data-testid={testid} style={{ padding: 22, position: 'relative', overflow: 'hidden' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
        <span style={{ fontFamily: 'var(--font-display)', fontSize: 22, color: '#9945FF', fontWeight: 900 }}>{icon} {label}</span>
        <span className={`badge ${status === 'live' ? 'badge-green' : status === 'pwa' ? 'badge-amber' : 'badge-amber'}`}>{status.toUpperCase()}</span>
      </div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#7c98c4', marginBottom: 14 }}>{sub}</div>
      {children}
    </div>
  );

  return (
    <div className="page-container fade-in">
      <p className="section-label fade-in-1">⚡ DOWNLOAD</p>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <h1 className="font-display fade-in-2" style={{ fontSize: 36, fontWeight: 900, color: '#9945FF' }}>GET YABBAI</h1>
        <span className="badge badge-green">PWA · ANDROID · DESKTOP</span>
      </div>
      <p style={{ color: '#7c98c4', maxWidth: 760, marginBottom: 28, fontSize: 13, lineHeight: 1.6 }}>
        YabbAI is a Progressive Web App — install it like a native app with one click. Android APK comes from the same
        codebase via a Trusted Web Activity (TWA) wrapper. Real signed APK requires Android Studio on your local machine —
        full build recipe linked below.
      </p>

      <div className="grid-3 fade-in-3" style={{ marginBottom: 28 }}>
        {/* PWA / Web */}
        <Card icon="◆" label="WEB APP" sub="Runs in any modern browser" status="live" testid="card-web">
          <ul style={{ fontSize: 12, color: '#e8f0ff', lineHeight: 1.7, marginLeft: 16, marginBottom: 12 }}>
            <li>Treasury Recovery + Phantom signing</li>
            <li>Buy-and-Burn / Dust Sweep / Pull Liquidity</li>
            <li>Miner with thread + wattage controls</li>
            <li>Multi-chain Earnings Router (SOL/ETH/BTC/SUI)</li>
          </ul>
          <Link to="/" className="btn btn-primary" style={{ textDecoration: 'none' }} data-testid="open-webapp">
            ▸ Open Web App
          </Link>
        </Card>

        {/* Install PWA */}
        <Card icon="▸" label={platform === 'android' ? 'ANDROID PWA' : platform === 'ios' ? 'iOS PWA' : 'INSTALL'}
              sub="Install to home screen — works offline" status="pwa" testid="card-install">
          <ul style={{ fontSize: 12, color: '#e8f0ff', lineHeight: 1.7, marginLeft: 16, marginBottom: 12 }}>
            <li>Behaves like a native app on Android/Desktop</li>
            <li>Full-screen, no browser chrome</li>
            <li>Push notifications support (coming next)</li>
            <li>Auto-update from the web</li>
          </ul>
          {installable ? (
            <button onClick={install} className="btn btn-green" data-testid="install-pwa-btn">► INSTALL NOW</button>
          ) : platform === 'ios' ? (
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#F5A623' }}>
              iOS: tap Share → "Add to Home Screen"
            </div>
          ) : platform === 'android' ? (
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#F5A623' }}>
              Tap browser menu → "Install app" / "Add to Home Screen"
            </div>
          ) : (
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#F5A623' }}>
              Chrome / Edge: address bar → install icon. Or open this page on Android.
            </div>
          )}
        </Card>

        {/* Android APK */}
        <Card icon="📱" label="ANDROID APK" sub="Real signed APK · build locally" status="beta" testid="card-apk">
          <ul style={{ fontSize: 12, color: '#e8f0ff', lineHeight: 1.7, marginLeft: 16, marginBottom: 12 }}>
            <li>Trusted Web Activity (TWA) wrapper</li>
            <li>Same codebase, full hardware access</li>
            <li>WASM miner + WebGL2 GPU runs natively</li>
            <li>Requires Android Studio + JDK 17 to build</li>
          </ul>
          <a href="/android-build" className="btn btn-amber" style={{ textDecoration: 'none' }} data-testid="apk-build-instructions">
            ▸ BUILD INSTRUCTIONS
          </a>
        </Card>
      </div>

      {/* Desktop */}
      <div className="card fade-in-4" style={{ marginBottom: 24 }}>
        <p className="section-label" style={{ marginBottom: 12 }}>DESKTOP WRAPPER (TAURI)</p>
        <p style={{ color: '#7c98c4', fontSize: 12, marginBottom: 14, lineHeight: 1.6 }}>
          For Windows / macOS / Linux native binaries with system tray, hardware miner, and persistent background workers,
          wrap the web app with Tauri. ~50MB binary instead of 200MB Electron.
        </p>
        <div style={{
          fontFamily: 'var(--font-mono)', fontSize: 11, color: '#14F195',
          background: 'rgba(8,16,36,0.6)', padding: 14, borderRadius: 6,
          border: '1px solid rgba(20,241,149,0.2)', whiteSpace: 'pre-wrap', overflow: 'auto',
        }}>
{`# Clone YabbAI desktop wrapper
git clone https://github.com/your-org/yabbai-tauri
cd yabbai-tauri
yarn install
yarn tauri build           # → src-tauri/target/release/bundle/{dmg,msi,deb}`}
        </div>
      </div>

      {/* Android build instructions inline */}
      <div className="card fade-in-4" id="android-build">
        <p className="section-label" style={{ marginBottom: 12 }}>ANDROID APK · LOCAL BUILD</p>
        <p style={{ color: '#7c98c4', fontSize: 12, marginBottom: 14, lineHeight: 1.6 }}>
          The TWA skeleton lives at <code style={{ color: '#9945FF' }}>/app/android/</code> in your repo. To produce a signed APK,
          install Android Studio + JDK 17, then:
        </p>
        <div style={{
          fontFamily: 'var(--font-mono)', fontSize: 11, color: '#14F195',
          background: 'rgba(8,16,36,0.6)', padding: 14, borderRadius: 6,
          border: '1px solid rgba(20,241,149,0.2)', whiteSpace: 'pre-wrap', overflow: 'auto',
        }}>
{`cd /app/android

# 1) Install Bubblewrap CLI (one-time)
npm install -g @bubblewrap/cli

# 2) Initialize (only first time)
bubblewrap init --manifest=https://yabbai-mainnet-live.preview.emergentagent.com/manifest.json

# 3) Build the signed APK
bubblewrap build

# Output: ./app-release-signed.apk
# Install on device: adb install ./app-release-signed.apk`}
        </div>
        <p style={{ color: '#F5A623', fontSize: 11, marginTop: 12, fontFamily: 'var(--font-mono)' }}>
          ⚠ You'll need to set up a keystore (one-time): <code style={{ color: '#14F195' }}>keytool -genkey -v -keystore yabbai.keystore -alias yabbai -keyalg RSA -keysize 2048 -validity 10000</code>
        </p>
      </div>
    </div>
  );
}
