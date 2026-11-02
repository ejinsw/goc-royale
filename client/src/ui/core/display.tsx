import {
  useEffect,
  useLayoutEffect,
  useRef,
  type ReactNode,
  type Ref,
  type RefObject,
} from "react";
import { feedback, type Phase } from "./feedback";
import { Icon, type IconName } from "./icons";
import { PressInput } from "./control";
import type { SizeName, VariantName } from "./tokens";

/**
 * The single non-interactive interface (docs/CODE-PRACTICES.md §3.2). Panels,
 * badges, labels, meters, callouts, sheets, tables, and portraits are display
 * kinds mapped to these renderers.
 */
export type DisplayType =
  | "panel"
  | "badge"
  | "label"
  | "meter"
  | "callout"
  | "sheet"
  | "table"
  | "portrait"
  | "vignette";

export interface DisplaySpec {
  display: DisplayType;
  variant: VariantName;
  size?: SizeName;
}

export interface DisplayBase {
  kind: string;
  variant?: VariantName;
  size?: SizeName;
  /** Layout-only class (position, grid area). Never restyle a display. */
  className?: string;
  icon?: IconName;
  children?: ReactNode;
  /** Plays `emphasis` each time this key changes (after the first render). */
  pulseKey?: string | number;
  emphasis?: Phase;
  /** Free-form state for CSS, e.g. "critical" or "full". */
  state?: string;
}

/** Normalized meter value; the same shape for static and live meters. */
export interface MeterValue {
  /** 0..1 fill for bar and ring. */
  fill: number;
  /** Text inside or beside the meter. */
  text?: string;
  /** Whole segments for pips. */
  count?: number;
  /** 0..1 progress of the next pip. */
  partial?: number;
  /** "critical", "full", "empty", or "" for CSS state. */
  state?: string;
}

export interface PanelProps extends DisplayBase {
  as?: "div" | "section" | "header" | "footer" | "aside";
  label?: string;
}
export interface BadgeProps extends DisplayBase {
  text?: ReactNode;
}
export interface LabelProps extends DisplayBase {
  text: ReactNode;
  level?: "hero" | "title" | "heading" | "body" | "caption" | "number";
}
export interface MeterProps extends DisplayBase {
  mode: "bar" | "pips" | "ring";
  label: string;
  value?: MeterValue;
  /** Number of pips. */
  max?: number;
}
export interface CalloutProps extends DisplayBase {
  text: ReactNode;
  sub?: ReactNode;
  role?: "status" | "alert";
  onClose?: () => void;
}
export interface SheetProps extends DisplayBase {
  title: string;
  onClose: () => void;
  /** Hidden from the backdrop click; used while a choice must be made. */
  persistent?: boolean;
}
export interface TableProps extends DisplayBase {
  caption: string;
  columns: string[];
  rows: { key: string; cells: ReactNode[] }[];
}
export interface PortraitProps extends DisplayBase {
  src: string;
  alt: string;
}

export interface DisplayRendererProps<P extends DisplayBase = DisplayBase> {
  spec: DisplaySpec;
  props: P;
  elRef: RefObject<HTMLElement | null>;
}
export type DisplayRenderer = (p: DisplayRendererProps<any>) => ReactNode;

/** Shared data attributes: the CSS contract for every display. */
export function displayAttrs(spec: DisplaySpec, p: DisplayBase) {
  return {
    "data-ui": "display",
    "data-kind": p.kind,
    "data-display": spec.display,
    "data-variant": p.variant ?? spec.variant,
    "data-size": p.size ?? spec.size,
    "data-state": p.state || undefined,
  } as const;
}

const cls = (p: DisplayBase, base = "ui-display") =>
  p.className ? `${base} ${p.className}` : base;

/** Plays the emphasis phase when pulseKey changes, never on first render. */
export function useEmphasis(elRef: RefObject<HTMLElement | null>, p: DisplayBase) {
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (p.pulseKey !== undefined) feedback(elRef.current, p.emphasis ?? "pop");
  }, [p.pulseKey]);
}

export function PanelDisplay({ spec, props, elRef }: DisplayRendererProps<PanelProps>) {
  useEmphasis(elRef, props);
  const Tag = props.as ?? "div";
  return (
    <Tag
      ref={elRef as Ref<HTMLDivElement>}
      className={cls(props)}
      aria-label={props.label}
      {...displayAttrs(spec, props)}
    >
      {props.children}
    </Tag>
  );
}

export function BadgeDisplay({ spec, props, elRef }: DisplayRendererProps<BadgeProps>) {
  useEmphasis(elRef, props);
  return (
    <span ref={elRef as Ref<HTMLSpanElement>} className={cls(props)} {...displayAttrs(spec, props)}>
      {props.icon && <Icon name={props.icon} />}
      {(props.text ?? props.children) !== undefined && (
        <span className="ui-label" data-text="">
          {props.text ?? props.children}
        </span>
      )}
    </span>
  );
}

export function LabelDisplay({ spec, props, elRef }: DisplayRendererProps<LabelProps>) {
  useEmphasis(elRef, props);
  return (
    <span
      ref={elRef as Ref<HTMLSpanElement>}
      className={cls(props)}
      data-level={props.level ?? "body"}
      {...displayAttrs(spec, props)}
    >
      {props.icon && <Icon name={props.icon} />}
      <span data-text="">{props.text}</span>
    </span>
  );
}

/**
 * Write a meter value into its element. This is the only place meter state
 * reaches the DOM, for static meters (via layout effect) and live game
 * signals (via binding) alike. Fill is a custom property consumed by
 * transform-only CSS, so updates never trigger layout.
 */
export function applyMeter(el: HTMLElement | null, v: MeterValue) {
  if (!el) return;
  const fill = Math.max(0, Math.min(1, v.fill));
  el.style.setProperty("--fill", fill.toFixed(4));
  if (v.state) el.dataset.state = v.state;
  else delete el.dataset.state;
  el.setAttribute("aria-valuenow", String(Math.round(fill * 100)));
  if (v.text !== undefined) {
    el.setAttribute("aria-valuetext", v.text);
    const t = el.querySelector<HTMLElement>("[data-text]");
    if (t && t.textContent !== v.text) t.textContent = v.text;
  }
  if (v.count !== undefined) {
    const pips = el.querySelectorAll<HTMLElement>("[data-pip]");
    pips.forEach((pip, i) => {
      const f = i < v.count! ? 1 : i === v.count ? (v.partial ?? 0) : 0;
      pip.style.setProperty("--pip", f.toFixed(3));
      if (f >= 1) pip.dataset.on = "";
      else delete pip.dataset.on;
    });
  }
}

export function MeterDisplay({ spec, props, elRef }: DisplayRendererProps<MeterProps>) {
  useEmphasis(elRef, props);
  useLayoutEffect(() => {
    if (props.value) applyMeter(elRef.current, props.value);
  }, [props.value?.fill, props.value?.text, props.value?.count, props.value?.partial, props.value?.state]);
  return (
    <div
      ref={elRef as Ref<HTMLDivElement>}
      className={cls(props)}
      role="meter"
      aria-label={props.label}
      aria-valuemin={0}
      aria-valuemax={100}
      data-mode={props.mode}
      {...displayAttrs(spec, props)}
    >
      {props.icon && <Icon name={props.icon} />}
      {props.mode === "bar" && (
        <span className="ui-meter-track">
          <span className="ui-meter-fill" />
          <span className="ui-meter-text" data-text="" />
        </span>
      )}
      {props.mode === "pips" && (
        <span className="ui-meter-pips">
          {Array.from({ length: props.max ?? 3 }, (_, i) => (
            <i key={i} className="ui-pip" data-pip={i} />
          ))}
        </span>
      )}
      {props.mode === "ring" && (
        <svg className="ui-meter-ring" viewBox="0 0 100 100" aria-hidden="true">
          <circle className="ui-ring-track" cx="50" cy="50" r="45" pathLength={100} />
          <circle className="ui-ring-fill" cx="50" cy="50" r="45" pathLength={100} />
        </svg>
      )}
      {props.children}
    </div>
  );
}

export function CalloutDisplay({ spec, props, elRef }: DisplayRendererProps<CalloutProps>) {
  useEmphasis(elRef, { ...props, emphasis: props.emphasis ?? "pop" });
  return (
    <div
      ref={elRef as Ref<HTMLDivElement>}
      className={cls(props)}
      role={props.role ?? "status"}
      {...displayAttrs(spec, props)}
    >
      {props.icon && <Icon name={props.icon} />}
      <span className="ui-text">
        <span className="ui-label" data-text="">
          {props.text}
        </span>
        {props.sub && <span className="ui-sub">{props.sub}</span>}
      </span>
      {props.children}
      {props.onClose && (
        <PressInput
          spec={{ input: "press", variant: "quiet", size: "sm", profile: "soft" }}
          props={{ kind: "icon", label: "Dismiss", hideLabel: true, icon: "close", onPress: props.onClose }}
        />
      )}
    </div>
  );
}

const FOCUSABLE =
  'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';

export function SheetDisplay({ spec, props, elRef }: DisplayRendererProps<SheetProps>) {
  const onClose = useRef(props.onClose);
  onClose.current = props.onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const first = elRef.current?.querySelector<HTMLElement>(FOCUSABLE);
    first?.focus({ preventScroll: true });
    return () => previous?.focus?.({ preventScroll: true });
  }, []);
  return (
    <div
      className="ui-backdrop"
      onPointerDown={(e) => {
        if (!props.persistent && e.target === e.currentTarget) onClose.current();
      }}
    >
      <section
        ref={elRef as Ref<HTMLElement>}
        className={cls(props)}
        role="dialog"
        aria-modal="true"
        aria-label={props.title}
        {...displayAttrs(spec, props)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.stopPropagation();
            onClose.current();
            return;
          }
          if (e.key !== "Tab") return;
          const items = Array.from(
            e.currentTarget.querySelectorAll<HTMLElement>(FOCUSABLE),
          );
          if (!items.length) return;
          const first = items[0],
            last = items[items.length - 1];
          if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last.focus();
          } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }}
      >
        <header className="ui-sheet-head">
          {props.icon && <Icon name={props.icon} />}
          <h2>{props.title}</h2>
          <PressInput
            spec={{ input: "press", variant: "dark", size: "sm", profile: "soft" }}
            props={{
              kind: "icon",
              label: "Close",
              hideLabel: true,
              icon: "close",
              onPress: () => onClose.current(),
            }}
          />
        </header>
        <div className="ui-sheet-body">{props.children}</div>
      </section>
    </div>
  );
}

export function TableDisplay({ spec, props, elRef }: DisplayRendererProps<TableProps>) {
  return (
    <div ref={elRef as Ref<HTMLDivElement>} className={cls(props)} {...displayAttrs(spec, props)}>
      <table>
        <caption>{props.caption}</caption>
        <thead>
          <tr>
            {props.columns.map((c) => (
              <th key={c} scope="col">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {props.rows.map((r) => (
            <tr key={r.key}>
              {r.cells.map((c, i) => (
                <td key={i}>{c}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function PortraitDisplay({ spec, props, elRef }: DisplayRendererProps<PortraitProps>) {
  return (
    <span ref={elRef as Ref<HTMLSpanElement>} className={cls(props)} {...displayAttrs(spec, props)}>
      <img src={props.src} alt={props.alt} draggable={false} />
    </span>
  );
}

/** Full-screen overlay used for hit and hazard flashes. */
export function VignetteDisplay({ spec, props, elRef }: DisplayRendererProps<DisplayBase>) {
  return (
    <div
      ref={elRef as Ref<HTMLDivElement>}
      className={cls(props)}
      aria-hidden="true"
      {...displayAttrs(spec, props)}
    />
  );
}
