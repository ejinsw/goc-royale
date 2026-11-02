import { useRef, type ReactNode, type RefObject } from "react";
import type { ControlBase, ControlSpec, InputRenderer, InputType } from "./control";
import type { DisplayBase, DisplayRenderer, DisplaySpec, DisplayType } from "./display";
import { installTokenCss } from "./tokens";

/**
 * The kit factory (docs/CODE-PRACTICES.md §2–4). A kit is configuration:
 * which control and display kinds exist, their default variant, size, and
 * feedback profile, and which renderer draws each input or display type.
 * `extendKit` layers a kit on top of another, so gameKit inherits every
 * menuKit kind and renderer and only adds what it needs.
 */
export interface KitConfig {
  id: string;
  controls: Record<string, ControlSpec>;
  displays: Record<string, DisplaySpec>;
  inputs: Partial<Record<InputType, InputRenderer>>;
  renderers: Partial<Record<DisplayType, DisplayRenderer>>;
  /**
   * Optional hook every display of this kit runs with its root element. The
   * game kit uses it to bind live signals and reactions; the menu kit has none.
   * It is fixed per kit, so hook order is stable.
   */
  useBinding?: (
    ref: RefObject<HTMLElement | null>,
    spec: DisplaySpec,
    props: DisplayBase,
  ) => void;
}

export interface Kit<CP extends ControlBase, DP extends DisplayBase> {
  config: KitConfig;
  Control: (props: CP) => ReactNode;
  Display: (props: DP) => ReactNode;
}

export function createKit<CP extends ControlBase, DP extends DisplayBase>(
  config: KitConfig,
): Kit<CP, DP> {
  installTokenCss();
  function Control(props: CP) {
    const spec = config.controls[props.kind];
    if (!spec) throw new Error(`${config.id} kit has no control kind "${props.kind}"`);
    const Renderer = config.inputs[spec.input];
    if (!Renderer) throw new Error(`${config.id} kit cannot render "${spec.input}" input`);
    return <Renderer spec={spec} props={props} />;
  }
  function Display(props: DP) {
    const spec = config.displays[props.kind];
    if (!spec) throw new Error(`${config.id} kit has no display kind "${props.kind}"`);
    const Renderer = config.renderers[spec.display];
    if (!Renderer) throw new Error(`${config.id} kit cannot render "${spec.display}" display`);
    const ref = useRef<HTMLElement | null>(null);
    config.useBinding?.(ref, spec, props);
    return <Renderer spec={spec} props={props} elRef={ref} />;
  }
  return { config, Control, Display };
}

export function extendKit<CP extends ControlBase, DP extends DisplayBase>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  base: Kit<any, any>,
  ext: Partial<Omit<KitConfig, "id">> & { id: string },
): Kit<CP, DP> {
  return createKit<CP, DP>({
    id: ext.id,
    controls: { ...base.config.controls, ...ext.controls },
    displays: { ...base.config.displays, ...ext.displays },
    inputs: { ...base.config.inputs, ...ext.inputs },
    renderers: { ...base.config.renderers, ...ext.renderers },
    useBinding: ext.useBinding ?? base.config.useBinding,
  });
}
