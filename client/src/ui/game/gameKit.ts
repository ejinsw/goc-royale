import type { ControlSpec } from "../core/control";
import {
  VignetteDisplay,
  type DisplayBase,
  type DisplaySpec,
} from "../core/display";
import { extendKit } from "../core/kit";
import { menuKit, type MenuControlProps, type MenuDisplayProps } from "../menu/menuKit";
import { useSignalBinding, type SignalDisplayProps } from "./reactions";
import { StickInput, type StickProps } from "./stick";

/**
 * gameKit = menuKit + live signal binding + the stick input
 * (docs/CODE-PRACTICES.md §2, §6). Every menu kind is inherited unchanged.
 */
export const GAME_CONTROLS = {
  stick: { input: "stick", variant: "glass", size: "lg", profile: "stick" },
} satisfies Record<string, ControlSpec>;

export const GAME_DISPLAYS = {
  vignette: { display: "vignette", variant: "quiet" },
} satisfies Record<string, DisplaySpec>;

export type GameControlProps =
  | MenuControlProps
  | (Omit<StickProps, "kind"> & { kind: "stick" });

export type GameDisplayProps = (
  | MenuDisplayProps
  | (Omit<DisplayBase, "kind"> & { kind: "vignette" })
) &
  SignalDisplayProps;

export const gameKit = extendKit<GameControlProps, GameDisplayProps>(menuKit, {
  id: "game",
  controls: GAME_CONTROLS,
  displays: GAME_DISPLAYS,
  inputs: { stick: StickInput },
  renderers: { vignette: VignetteDisplay },
  useBinding: useSignalBinding,
});
