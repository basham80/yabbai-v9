import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import Layout from './components/Layout';
import CommandCentre from './pages/CommandCentre';
import YabbaiApp from './pages/YabbaiApp';
import Launch from './pages/Launch';
import Payment from './pages/Payment';
import Mission from './pages/Mission';
import Wallet from './pages/Wallet';
import Withdraw from './pages/Withdraw';
import ApiPulse from './pages/ApiPulse';
import Basham from './pages/Basham';
import SideHustle from './pages/SideHustle';
import Promo from './pages/Promo';
import TreasuryRecovery from './pages/TreasuryRecovery';
import './index.css';

function App() {
  return (
    <BrowserRouter>
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: 'rgba(8, 16, 36, 0.95)',
            color: '#e8f0ff',
            border: '1px solid rgba(153, 69, 255, 0.4)',
            fontFamily: 'var(--font-mono)',
            fontSize: '13px',
            backdropFilter: 'blur(12px)',
          },
        }}
      />
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<CommandCentre />} />
          <Route path="/yabbai" element={<YabbaiApp />} />
          <Route path="/launch" element={<Launch />} />
          <Route path="/payment" element={<Payment />} />
          <Route path="/mission" element={<Mission />} />
          <Route path="/wallet" element={<Wallet />} />
          <Route path="/withdraw" element={<Withdraw />} />
          <Route path="/treasury-recovery" element={<TreasuryRecovery />} />
          <Route path="/api-pulse" element={<ApiPulse />} />
          <Route path="/basham" element={<Basham />} />
          <Route path="/side-hustle" element={<SideHustle />} />
          <Route path="/promo" element={<Promo />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
