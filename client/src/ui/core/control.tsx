import {
  useImperativeHandle,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type Ref,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { feedback } from "./feedback";
import { Icon, type IconName } from "./icons";
import type { ProfileName, SizeName, VariantName } from "./tokens";

/**
 * The single interactive interface (docs/CODE-PRACTICES.md §3). Every
 * button, field, toggle, slider, choice, and stick is a `Control` whose kind
 * maps to one of these input types. Kits register a renderer per input type;
 * all renderers share the press state machine and the feedback engine.
 */
export type InputType = "press" | "text" | "toggle" | "range" | "choice" | "stick";

export interface ControlSpec {
  input: InputType;
  variant: VariantName;
  size: SizeName;
  profile: ProfileName;
}

/** Imperative access for screens that must deny or focus a control. */
export interface ControlHandle {
  el: HTMLElement | null;
  focus(): void;
  deny(reason?: string): void;
  confirm(): void;
}

export interface ControlBase {
  kind: string;
  variant?: VariantName;
  size?: SizeName;
  profile?: ProfileName;
  /** Accessible name. Visible unless `hideLabel`. */
  label: string;
  hideLabel?: boolean;
  icon?: IconName;
  /** `true` disables; a string disables and is the reason shown on deny. */
  disabled?: boolean | string;
  /** Layout-only class (position, grid area). Never restyle a control. */
  className?: string;
  handle?: Ref<ControlHandle>;
}

export type PressResult = void | "confirm" | "deny" | Promise<unknown>;

export interface PressProps extends ControlBase {
  onPress: () => PressResult;
  selected?: boolean;
  /** Secondary line under the label. */
  sub?: ReactNode;
  /** Corner badge content. */
  badge?: ReactNode;
  /** Replaces the label text as visible content. */
  children?: ReactNode;
}

export interface TextProps extends ControlBase {
  value: string;
  onChange: (value: string) => void;
  onSubmit?: () => void;
  placeholder?: string;
  maxLength?: number;
  transform?: "upper";
  validate?: (value: string) => boolean;
  inputMode?: "text" | "numeric";
  enterKeyHint?: "go" | "done";
  autoComplete?: string;
}

export interface ToggleProps extends ControlBase {
  value: boolean;
  onChange: (value: boolean) => void;
}

export interface RangeProps extends ControlBase {
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step: number;
  format?: (value: number) => string;
}

export interface ChoiceOption<T extends string> {
  value: T;
  label: string;
  sub?: string;
  icon?: IconName;
  disabled?: boolean | string;
}

export interface ChoiceProps<T extends string = string> extends ControlBase {
  value: T;
  options: ChoiceOption<T>[];
  onChange: (value: T) => void;
}

export interface InputRendererProps<P extends ControlBase = ControlBase> {
  spec: ControlSpec;
  props: P;
}
export type InputRenderer = (p: InputRendererProps<any>) => ReactNode;

const reasonOf = (d: boolean | string | undefined) =>
  typeof d === "string" ? d : undefined;

/** Shared data attributes: the CSS contract for every control. */
export function controlAttrs(spec: ControlSpec, p: ControlBase) {
  return {
    "data-ui": "control",
    "data-kind": p.kind,
    "data-input": spec.input,
    "data-variant": p.variant ?? spec.variant,
    "data-size": p.size ?? spec.size,
    "data-profile": p.profile ?? spec.profile,
    "data-reason": reasonOf(p.disabled),
    "aria-disabled": p.disabled ? true : undefined,
  } as const;
}

const isActivationKey = (e: ReactKeyboardEvent) => e.key === "Enter" || e.key === " ";

/** Press, release, and cancel visuals shared by every pressable element. */
export function pressHandlers() {
  return {
    onPointerDown: (e: ReactPointerEvent<HTMLElement>) => {
      if (e.button > 0) return;
      feedback(e.currentTarget, "press");
    },
    onPointerUp: (e: ReactPointerEvent<HTMLElement>) =>
      feedback(e.currentTarget, "release"),
    onPointerLeave: (e: ReactPointerEvent<HTMLElement>) =>
      feedback(e.currentTarget, "cancel"),
    onPointerCancel: (e: ReactPointerEvent<HTMLElement>) =>
      feedback(e.currentTarget, "cancel"),
    onKeyDown: (e: ReactKeyboardEvent<HTMLElement>) => {
      if (isActivationKey(e) && !e.repeat) feedback(e.currentTarget, "press");
    },
    onKeyUp: (e: ReactKeyboardEvent<HTMLElement>) => {
      if (isActivationKey(e)) feedback(e.currentTarget, "release");
    },
  };
}

function useHandle(handle: Ref<ControlHandle> | undefined, focusTarget?: () => HTMLElement | null) {
  const ref = useRef<HTMLElement | null>(null);
  useImperativeHandle(handle, () => ({
    get el() {
      return ref.current;
    },
    focus: () => (focusTarget?.() ?? ref.current)?.focus(),
    deny: (reason?: string) => feedback(ref.current, "deny", { reason }),
    confirm: () => feedback(ref.current, "confirm"),
  }));
  return ref;
}

/** Run a press result through confirm, deny, or busy feedback. */
export function settle(
  el: HTMLElement | null,
  result: PressResult,
  setBusy?: (busy: boolean) => void,
) {
  if (result === "deny") feedback(el, "deny");
  else if (result === "confirm") feedback(el, "confirm");
  else if (result instanceof Promise) {
    setBusy?.(true);
    result.then(
      () => feedback(el, "confirm"),
      () => feedback(el, "deny"),
    ).finally(() => setBusy?.(false));
  }
}

export function PressInput({ spec, props }: InputRendererProps<PressProps>) {
  const ref = useHandle(props.handle);
  const [busy, setBusy] = useState(false);
  const reason = reasonOf(props.disabled);
  return (
    <button
      ref={ref as Ref<HTMLButtonElement>}
      type="button"
      className={props.className ? `ui-control ${props.className}` : "ui-control"}
      {...controlAttrs(spec, props)}
      data-selected={props.selected ? "" : undefined}
      aria-pressed={props.selected === undefined ? undefined : props.selected}
      aria-busy={busy || undefined}
      aria-label={props.hideLabel || props.children ? props.label : undefined}
      data-busy={busy ? "" : undefined}
      {...pressHandlers()}
      onClick={() => {
        if (busy) return;
        if (props.disabled) {
          feedback(ref.current, "deny", { reason });
          return;
        }
        settle(ref.current, props.onPress(), setBusy);
      }}
    >
      {props.icon && <Icon name={props.icon} />}
      {props.children ??
        (!props.hideLabel && (
          <span className="ui-text">
            <span className="ui-label">{props.label}</span>
            {props.sub && <span className="ui-sub">{props.sub}</span>}
          </span>
        ))}
      {props.badge !== undefined && <span className="ui-corner">{props.badge}</span>}
    </button>
  );
}

export function TextInput({ spec, props }: InputRendererProps<TextProps>) {
  const input = useRef<HTMLInputElement>(null);
  const ref = useHandle(props.handle, () => input.current);
  const bar = useRef<HTMLSpanElement>(null);
  const valid = props.validate?.(props.value);
  return (
    <label
      ref={ref as Ref<HTMLLabelElement>}
      className={props.className ? `ui-control ${props.className}` : "ui-control"}
      {...controlAttrs(spec, props)}
      data-valid={props.value ? (valid === false ? "no" : valid ? "yes" : undefined) : undefined}
      onPointerDown={(e) => feedback(e.currentTarget, "press")}
      onPointerUp={(e) => feedback(e.currentTarget, "release")}
      onPointerLeave={(e) => feedback(e.currentTarget, "cancel")}
    >
      {props.icon && <Icon name={props.icon} />}
      <span className="ui-field">
        {!props.hideLabel && <span className="ui-caption">{props.label}</span>}
        <input
          ref={input}
          value={props.value}
          aria-label={props.label}
          placeholder={props.placeholder}
          maxLength={props.maxLength}
          inputMode={props.inputMode}
          enterKeyHint={props.enterKeyHint}
          autoComplete={props.autoComplete ?? "off"}
          autoCapitalize={props.transform === "upper" ? "characters" : "off"}
          autoCorrect="off"
          spellCheck={false}
          disabled={props.disabled === true}
          onChange={(e) => {
            const v =
              props.transform === "upper" ? e.target.value.toUpperCase() : e.target.value;
            props.onChange(v);
            feedback(bar.current, "tick");
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && props.onSubmit) {
              e.preventDefault();
              props.onSubmit();
            }
          }}
        />
        <span className="ui-field-bar" ref={bar} />
      </span>
      {props.value && valid !== undefined && (
        <Icon name={valid ? "check" : "warning"} className="ui-valid" />
      )}
    </label>
  );
}

export function ToggleInput({ spec, props }: InputRendererProps<ToggleProps>) {
  const ref = useHandle(props.handle);
  return (
    <button
      ref={ref as Ref<HTMLButtonElement>}
      type="button"
      role="switch"
      aria-checked={props.value}
      className={props.className ? `ui-control ${props.className}` : "ui-control"}
      {...controlAttrs(spec, props)}
      {...pressHandlers()}
      onClick={() => {
        if (props.disabled) {
          feedback(ref.current, "deny", { reason: reasonOf(props.disabled) });
          return;
        }
        props.onChange(!props.value);
        feedback(ref.current, "tick", { cue: "ui_toggle" });
      }}
    >
      {props.icon && <Icon name={props.icon} />}
      <span className="ui-text">
        <span className="ui-label">{props.label}</span>
      </span>
      <span className="ui-switch" data-on={props.value ? "" : undefined}>
        <span className="ui-switch-knob">
          <Icon name={props.value ? "check" : "close"} />
        </span>
      </span>
    </button>
  );
}

export function RangeInput({ spec, props }: InputRendererProps<RangeProps>) {
  const ref = useHandle(props.handle);
  const readout = useRef<HTMLSpanElement>(null);
  const fill = (props.value - props.min) / Math.max(1e-9, props.max - props.min);
  const text = props.format ? props.format(props.value) : String(props.value);
  return (
    <label
      ref={ref as Ref<HTMLLabelElement>}
      className={props.className ? `ui-control ${props.className}` : "ui-control"}
      {...controlAttrs(spec, props)}
    >
      {props.icon && <Icon name={props.icon} />}
      <span className="ui-text">
        <span className="ui-label">{props.label}</span>
      </span>
      <span className="ui-track" style={{ "--fill": fill } as CSSProperties}>
        <input
          type="range"
          min={props.min}
          max={props.max}
          step={props.step}
          value={props.value}
          aria-label={props.label}
          aria-valuetext={text}
          disabled={props.disabled === true}
          onPointerDown={() => feedback(ref.current, "press", { cue: null })}
          onPointerUp={() => feedback(ref.current, "release")}
          onChange={(e) => {
            const v = +e.target.value;
            props.onChange(v);
            feedback(readout.current, "tick");
          }}
        />
      </span>
      <span className="ui-readout" ref={readout}>
        {text}
      </span>
    </label>
  );
}

export function ChoiceInput({ spec, props }: InputRendererProps<ChoiceProps>) {
  const ref = useHandle(props.handle);
  const items = useRef<(HTMLButtonElement | null)[]>([]);
  const groupReason = reasonOf(props.disabled);
  const pick = (i: number, focus: boolean) => {
    const o = props.options[i];
    const el = items.current[i];
    if (!o || !el) return;
    if (focus) el.focus();
    const reason = groupReason ?? reasonOf(o.disabled);
    if (props.disabled || o.disabled) {
      feedback(el, "deny", { reason });
      return;
    }
    if (o.value !== props.value) {
      props.onChange(o.value);
      feedback(el, "confirm");
    }
  };
  const current = Math.max(
    0,
    props.options.findIndex((o) => o.value === props.value),
  );
  return (
    <div
      ref={ref as Ref<HTMLDivElement>}
      role="radiogroup"
      aria-label={props.label}
      className={props.className ? `ui-control ${props.className}` : "ui-control"}
      {...controlAttrs(spec, props)}
      onKeyDown={(e) => {
        const step =
          e.key === "ArrowRight" || e.key === "ArrowDown"
            ? 1
            : e.key === "ArrowLeft" || e.key === "ArrowUp"
              ? -1
              : 0;
        if (!step) return;
        e.preventDefault();
        const n = props.options.length;
        pick((current + step + n) % n, true);
      }}
    >
      {props.options.map((o, i) => (
        <button
          key={o.value}
          ref={(el) => {
            items.current[i] = el;
          }}
          type="button"
          role="radio"
          aria-checked={o.value === props.value}
          tabIndex={i === current ? 0 : -1}
          className="ui-option"
          data-variant={o.value === props.value ? "selected" : props.variant ?? spec.variant}
          data-size={props.size ?? spec.size}
          data-profile={props.profile ?? spec.profile}
          data-reason={groupReason ?? reasonOf(o.disabled)}
          aria-disabled={props.disabled || o.disabled ? true : undefined}
          {...pressHandlers()}
          onClick={() => pick(i, false)}
        >
          {o.icon && <Icon name={o.icon} />}
          <span className="ui-text">
            <span className="ui-label">{o.label}</span>
            {o.sub && <span className="ui-sub">{o.sub}</span>}
          </span>
          {o.value === props.value && <Icon name="check" className="ui-tick" />}
        </button>
      ))}
    </div>
  );
}
