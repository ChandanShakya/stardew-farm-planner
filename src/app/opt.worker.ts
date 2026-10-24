// Runs the optimizer off the main thread so the UI stays responsive.
import type { Plan } from './engine.ts';
import { optimizePlan, type OptOptions } from './optimize.ts';

self.onmessage = (e: MessageEvent<{ plan: Plan; opts: OptOptions }>) => {
  try {
    const r = optimizePlan(e.data.plan, e.data.opts, s => self.postMessage({ progress: s }));
    self.postMessage({ result: r });
  } catch (err) {
    self.postMessage({ error: String(err) });
  }
};
