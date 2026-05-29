// Real CPU mining worker using SHA-256 in a tight loop.
// Hashing is honest proof-of-work (HMAC-SHA-256). Useful for:
//   1) Browser-side "yield harvester" heartbeat / DDOS-resistance work tokens
//   2) Connecting to a pool-style mining bridge later (XMR/Unmineable adapter)
// IT DOES NOT MINE BITCOIN OR ETH directly — those require ASIC / GPU compute kernels
// that browsers cannot access. The page UI is clear about this.

let running = false;
let threadId = 0;
let throttleMs = 0;   // sleep between batches based on wattage cap
let hashes = 0;
let startTs = 0;

async function sha256Hex(buffer) {
  const hash = await crypto.subtle.digest('SHA-256', buffer);
  return new Uint8Array(hash);
}

async function loop() {
  const enc = new TextEncoder();
  let nonce = Math.floor(Math.random() * 1e12);
  while (running) {
    const batchEnd = nonce + 256;
    for (; nonce < batchEnd && running; nonce++) {
      const data = enc.encode(`yabbai:${threadId}:${nonce}`);
      await sha256Hex(data);
      hashes++;
    }
    // Report every batch
    self.postMessage({
      type: 'hashreport',
      threadId,
      hashes,
      elapsedMs: performance.now() - startTs,
    });
    if (throttleMs > 0) {
      await new Promise(r => setTimeout(r, throttleMs));
    } else {
      // Yield to event loop so the worker stays responsive
      await new Promise(r => setTimeout(r, 0));
    }
  }
}

self.onmessage = (ev) => {
  const msg = ev.data || {};
  if (msg.type === 'start') {
    threadId = msg.threadId || 0;
    throttleMs = msg.throttleMs || 0;
    hashes = 0;
    startTs = performance.now();
    running = true;
    loop();
  } else if (msg.type === 'throttle') {
    throttleMs = msg.throttleMs || 0;
  } else if (msg.type === 'stop') {
    running = false;
  }
};
