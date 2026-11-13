/**
 * Prints the controlled-network report for the standard §4.4 cases.
 * Run with: npm run netsim
 */
import { runScenario, type Scenario } from "../tests/netsim";

export const SCENARIOS: Scenario[] = [
  { name: "LAN 10 ms", rttMs: 10, loss: 0, jitterMs: 2 },
  { name: "50 ms RTT, 0% loss", rttMs: 50, loss: 0, jitterMs: 6 },
  { name: "100 ms RTT, 1% loss", rttMs: 100, loss: 0.01, jitterMs: 8 },
  { name: "200 ms RTT, 3% loss", rttMs: 200, loss: 0.03, jitterMs: 12 },
  {
    name: "100 ms + 500 ms outage",
    rttMs: 100,
    loss: 0,
    jitterMs: 8,
    outage: { start: 9000, end: 9500 },
  },
];

const f = (v: number, d = 3) => (Number.isFinite(v) ? v.toFixed(d) : "–");
const rows = SCENARIOS.map(runScenario);
console.log(
  [
    "scenario".padEnd(24),
    "corr p50",
    "corr p95",
    "corr max",
    "jump/frame max",
    "stale p95 ms",
    "stale max ms",
    "resp frames",
    "attacks sent/shown",
    "repeat ids",
    "max pending",
    "up queue bytes",
    "down queue bytes",
  ].join(" | "),
);
for (const r of rows)
  console.log(
    [
      r.name.padEnd(24),
      f(r.corrections.p50).padStart(8),
      f(r.corrections.p95).padStart(8),
      f(r.corrections.max).padStart(8),
      f(r.visibleJumpMax).padStart(14),
      f(r.staleAgeMs.p95, 0).padStart(12),
      f(r.staleAgeMs.max, 0).padStart(12),
      f(r.responseFrames.max, 0).padStart(11),
      `${r.attacksSent}/${r.attacksPresented}`.padStart(18),
      String(r.repeatDeliveries).padStart(10),
      String(r.maxPendingInputs).padStart(11),
      String(r.maxUpQueuedBytes).padStart(14),
      String(r.maxDownQueuedBytes).padStart(16),
    ].join(" | "),
  );
