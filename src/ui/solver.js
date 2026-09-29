// Auto-arrange: run the MILP (planner.js + HiGHS) in a Web Worker so the page stays responsive; fall back to the main thread when
// workers are unavailable. planner.js is a classic script that defines the global BECPlanner.
const OPTS = { output_flag: false, mip_rel_gap: 0.05, time_limit: 20 };

let worker = null, seq = 0;
function solveOffThread(scn) {
  return new Promise((resolve, reject) => {
    if (typeof Worker === 'undefined') { reject(new Error('Web Workers unavailable')); return; }
    try { worker = worker || new Worker('solver-worker.js'); } catch (err) { worker = null; reject(new Error(`worker create failed: ${(err && err.message) || err}`)); return; }
    const id = ++seq;
    const cleanup = () => { worker.removeEventListener('message', onMsg); worker.removeEventListener('error', onErr); };
    const onMsg = e => { if (!e.data || e.data.id !== id) return; cleanup(); if (e.data.ok) resolve(e.data.res); else reject(new Error(e.data.error || 'solver error')); };
    const onErr = err => { cleanup(); worker = null; reject(new Error(`worker error: ${(err && err.message) || 'load failure'}`)); };
    worker.addEventListener('message', onMsg);
    worker.addEventListener('error', onErr);
    worker.postMessage({ id, scn, opts: OPTS });
  });
}

let highs = null, highsLoading = null;
const highsFactory = () => { const f = (typeof Highs !== 'undefined' && Highs) || (typeof Module !== 'undefined' && Module) || window.Highs || window.Module; return typeof f === 'function' ? f : null; };
function loadHighs() {
  if (highs) return Promise.resolve(highs);
  if (highsLoading) return highsLoading;
  highsLoading = new Promise((resolve, reject) => {
    const go = () => { const F = highsFactory(); if (!F) { reject(new Error('optimizer global not found after load')); return; } F({ locateFile: f => f }).then(h => { highs = h; resolve(h); }).catch(reject); };
    if (highsFactory()) { go(); return; }
    const s = document.createElement('script');
    s.src = 'highs.js'; s.async = true; s.onload = go; s.onerror = () => reject(new Error('Could not load highs.js.'));
    document.head.appendChild(s);
  });
  return highsLoading;
}

/** -> { status: 'optimal'|'infeasible'|'error'|'unavailable', placements?, reason? } */
export async function arrange(scn) {
  try { return await solveOffThread(scn); } catch (workerErr) { /* fall back below */ }
  let h;
  try { h = await loadHighs(); } catch (e) {
    return { status: 'unavailable', reason: location.protocol === 'file:' ? 'Auto-arrange needs the page served over HTTP. Open it through a local server or the published link, not by double-clicking the file.' : 'Could not load the optimizer. Make sure highs.js and highs.wasm sit next to index.html.' };
  }
  return window.BECPlanner.solvePlan(scn, lp => h.solve(lp, OPTS));
}
