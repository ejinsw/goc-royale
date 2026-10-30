import { metrics } from "./metrics";

/**
 * Development overlay (standard §4.3: RTT, jitter, loss and stale snapshot
 * age must be measured and visible). Hidden by default and outside the normal
 * HUD (§8.1). Toggle with the backtick key or open the app with `?debug`.
 * Updates a single <pre> at 4 Hz; never touches React state.
 */
export function installDevOverlay() {
  if (typeof document === "undefined") return;
  const el = document.createElement("pre");
  el.setAttribute("aria-hidden", "true");
  Object.assign(el.style, {
    position: "fixed",
    top: "56px",
    right: "8px",
    zIndex: "9999",
    margin: "0",
    padding: "6px 8px",
    font: "11px/1.35 ui-monospace, Menlo, monospace",
    color: "#e8fff4",
    background: "rgba(10, 30, 26, 0.82)",
    borderRadius: "6px",
    pointerEvents: "none",
    whiteSpace: "pre",
    display: "none",
  } satisfies Partial<CSSStyleDeclaration>);
  document.body.appendChild(el);
  let timer: ReturnType<typeof setInterval> | null = null;
  const show = (on: boolean) => {
    metrics.enabled = on;
    el.style.display = on ? "block" : "none";
    if (timer) clearInterval(timer);
    timer = on ? setInterval(() => (el.textContent = render()), 250) : null;
    if (on) el.textContent = render();
  };
  window.addEventListener("keydown", (e) => {
    const tag = (e.target as HTMLElement | null)?.tagName;
    if (e.code !== "Backquote" || tag === "INPUT" || tag === "TEXTAREA") return;
    show(!metrics.enabled);
  });
  if (new URLSearchParams(location.search).has("debug")) show(true);
}

const ms = (v: number) => (Number.isFinite(v) ? v.toFixed(1).padStart(6) : "     –");
const u = (v: number) => (Number.isFinite(v) ? v.toFixed(3) : "–");

function render() {
  const now = performance.now();
  const f = metrics.frames;
  const p50 = f.percentile(0.5);
  const long = f.count((v) => v > 33);
  const lines = [
    `GOC dev overlay  [\`] · ${metrics.role}`,
    `frame  p50 ${ms(p50)} ms  p95 ${ms(f.percentile(0.95))} ms  ~${Number.isFinite(p50) ? Math.round(1000 / p50) : "–"} fps`,
    `       long >33ms ${long}/${f.size}`,
  ];
  if (metrics.role === "guest")
    lines.push(
      `rtt    p50 ${ms(metrics.rtt.percentile(0.5))} ms  p95 ${ms(metrics.rtt.percentile(0.95))} ms`,
      `       jitter ${ms(metrics.jitter)} ms  late pings ${metrics.late}/${metrics.pingsSent}`,
    );
  const age = metrics.lastSnapshotAt ? now - metrics.lastSnapshotAt : NaN;
  lines.push(
    `snap   in ${metrics.snapshotsIn.perSecond(now).toFixed(1)} Hz  gap p95 ${ms(metrics.snapshotGaps.percentile(0.95))} ms`,
    `       stale age ${ms(age)} ms`,
    `corr   p50 ${u(metrics.corrections.percentile(0.5))}  p95 ${u(metrics.corrections.percentile(0.95))} units (n=${metrics.corrections.size})`,
  );
  if (metrics.role === "guest")
    lines.push(`net    in ${(metrics.bytesIn.perSecond(now) / 1024).toFixed(1)} KB/s`);
  if (metrics.role === "host")
    lines.push(
      `host   sim ${metrics.simTicks.perSecond(now).toFixed(1)} Hz  snapshots ${metrics.snapshotsOut.perSecond(now).toFixed(1)} Hz`,
      `       out ${(metrics.bytesOut.perSecond(now) / 1024).toFixed(1)} KB/s (all peers)`,
    );
  return lines.join("\n");
}
