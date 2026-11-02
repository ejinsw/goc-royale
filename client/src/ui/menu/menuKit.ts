import {
  ChoiceInput,
  PressInput,
  RangeInput,
  TextInput,
  ToggleInput,
  type ChoiceProps,
  type ControlSpec,
  type PressProps,
  type RangeProps,
  type TextProps,
  type ToggleProps,
} from "../core/control";
import {
  BadgeDisplay,
  CalloutDisplay,
  LabelDisplay,
  MeterDisplay,
  PanelDisplay,
  PortraitDisplay,
  SheetDisplay,
  TableDisplay,
  type BadgeProps,
  type CalloutProps,
  type DisplaySpec,
  type LabelProps,
  type MeterProps,
  type PanelProps,
  type PortraitProps,
  type SheetProps,
  type TableProps,
} from "../core/display";
import { createKit } from "../core/kit";

/**
 * menuKit: every control and display used by menus, lobby, results, and
 * settings. New menu needs extend these tables (CODE-PRACTICES §4).
 */
const press = (spec: Omit<ControlSpec, "input">): ControlSpec => ({ input: "press", ...spec });

export const MENU_CONTROLS = {
  /** Text button. */
  button: press({ variant: "secondary", size: "md", profile: "punchy" }),
  /** Square icon-only button. */
  icon: press({ variant: "glass", size: "sm", profile: "soft" }),
  /** Picture tile, e.g. a fighter in the picker. */
  tile: press({ variant: "glass", size: "md", profile: "punchy" }),
  /** Name plate above a fighter on the stage. */
  plate: press({ variant: "glass", size: "sm", profile: "soft" }),
  field: { input: "text", variant: "secondary", size: "md", profile: "soft" },
  toggle: { input: "toggle", variant: "dark", size: "md", profile: "soft" },
  slider: { input: "range", variant: "dark", size: "md", profile: "soft" },
  choice: { input: "choice", variant: "glass", size: "md", profile: "punchy" },
} satisfies Record<string, ControlSpec>;

export const MENU_DISPLAYS = {
  panel: { display: "panel", variant: "glass" },
  card: { display: "panel", variant: "dark" },
  badge: { display: "badge", variant: "dark", size: "sm" },
  label: { display: "label", variant: "quiet" },
  meter: { display: "meter", variant: "dark", size: "sm" },
  callout: { display: "callout", variant: "glass", size: "md" },
  toast: { display: "callout", variant: "dark", size: "sm" },
  sheet: { display: "sheet", variant: "glass" },
  table: { display: "table", variant: "dark" },
  portrait: { display: "portrait", variant: "dark" },
} satisfies Record<string, DisplaySpec>;

type PressKind = "button" | "icon" | "tile" | "plate";
export type MenuControlProps =
  | (Omit<PressProps, "kind"> & { kind: PressKind })
  | (Omit<TextProps, "kind"> & { kind: "field" })
  | (Omit<ToggleProps, "kind"> & { kind: "toggle" })
  | (Omit<RangeProps, "kind"> & { kind: "slider" })
  | (Omit<ChoiceProps<any>, "kind"> & { kind: "choice" });

export type MenuDisplayProps =
  | (Omit<PanelProps, "kind"> & { kind: "panel" | "card" })
  | (Omit<BadgeProps, "kind"> & { kind: "badge" })
  | (Omit<LabelProps, "kind"> & { kind: "label" })
  | (Omit<MeterProps, "kind"> & { kind: "meter" })
  | (Omit<CalloutProps, "kind"> & { kind: "callout" | "toast" })
  | (Omit<SheetProps, "kind"> & { kind: "sheet" })
  | (Omit<TableProps, "kind"> & { kind: "table" })
  | (Omit<PortraitProps, "kind"> & { kind: "portrait" });

export const menuKit = createKit<MenuControlProps, MenuDisplayProps>({
  id: "menu",
  controls: MENU_CONTROLS,
  displays: MENU_DISPLAYS,
  inputs: {
    press: PressInput,
    text: TextInput,
    toggle: ToggleInput,
    range: RangeInput,
    choice: ChoiceInput,
  },
  renderers: {
    panel: PanelDisplay,
    badge: BadgeDisplay,
    label: LabelDisplay,
    meter: MeterDisplay,
    callout: CalloutDisplay,
    sheet: SheetDisplay,
    table: TableDisplay,
    portrait: PortraitDisplay,
  },
});
