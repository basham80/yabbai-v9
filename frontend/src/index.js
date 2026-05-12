import { Buffer } from 'buffer';
import React from "react";
import ReactDOM from "react-dom/client";
import "@/index.css";
import App from "@/App";

// Polyfill Buffer for @solana/web3.js
if (typeof window !== 'undefined') {
  window.Buffer = window.Buffer || Buffer;
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
