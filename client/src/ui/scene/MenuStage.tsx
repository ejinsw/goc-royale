import { useEffect, useRef, useState } from "react";
import type { PressResult } from "../core/control";
import { Icon, type IconName } from "../core/icons";
import type { VariantName } from "../core/tokens";
import { menuKit } from "../menu/menuKit";
import type { MenuScene, StageState } from "./menuScene";

const { Control, Display } = menuKit;

/** What a name plate above a stage fighter shows and does. */
export interface StagePlate {
  key: string;
  /** Accessible name for the plate control. */
  label: string;
  title: string;
  /** Leading status icon, so state never relies on color alone. */
  icon?: IconName;
  caption?: string;
  badges?: { icon?: IconName; text: string; variant?: VariantName }[];
  /** Plate surface; defaults to the kit's plate variant. */
  variant?: VariantName;
  /** Extra action after the fighter hops. */
  onPress?: () => PressResult;
  /** Host actions use the same menuKit controls as the rest of the lobby. */
  actions?: {
    key: string;
    label: string;
    text: string;
    icon?: IconName;
    variant?: VariantName;
    onPress: () => PressResult;
  }[];
}

/**
 * The persistent 3D backdrop behind every menu screen. The scene module
 * (and Three.js) loads lazily, so the GUI is usable before it arrives. If
 * WebGL cannot start, plates fall back to normal page flow over the plain
 * background (docs/CODE-PRACTICES.md §7).
 */
export function MenuStage({ state, plates }: { state: StageState; plates: StagePlate[] }) {
  const host = useRef<HTMLDivElement>(null);
  const scene = useRef<MenuScene | null>(null);
  const labels = useRef(new Map<string, HTMLElement>());
  const latest = useRef(state);
  latest.current = state;
  // "loading" hides plates until the scene can place them; "off" means WebGL
  // could not start, so plates use normal page flow instead.
  const [mode, setMode] = useState<"loading" | "live" | "off">("loading");

  useEffect(() => {
    let cancelled = false;
    void import("./menuScene")
      .then(({ createMenuScene }) => {
        if (cancelled || !host.current) return;
        const s = createMenuScene(host.current, { onLost: () => setMode("off") });
        scene.current = s;
        for (const [key, el] of labels.current) s.attachLabel(key, el);
        s.set(latest.current);
        setMode(s.live ? "live" : "off");
      })
      .catch(() => !cancelled && setMode("off"));
    return () => {
      cancelled = true;
      scene.current?.dispose();
      scene.current = null;
    };
  }, []);

  const key = JSON.stringify(state);
  useEffect(() => {
    scene.current?.set(state);
  }, [key]);

  return (
    // The scene inserts its own canvas here (see createMenuScene).
    <div className="stage" data-scene={mode} ref={host}>
      {/* Crowded stages drop plate captions so ten names fit on a phone. */}
      <div className="stage-plates" data-dense={plates.length > 6 ? "" : undefined}>
        {plates.map((p) => (
          <div
            key={p.key}
            className="stage-plate"
            ref={(el) => {
              if (el) labels.current.set(p.key, el);
              else labels.current.delete(p.key);
              scene.current?.attachLabel(p.key, el);
            }}
          >
            <Control
              kind="plate"
              label={p.label}
              variant={p.variant}
              disabled={!p.onPress}
              onPress={() => {
                scene.current?.react(p.key, "hop");
                return p.onPress?.();
              }}
            >
              <span className="plate-title">
                {p.icon && <Icon name={p.icon} />}
                {p.title}
              </span>
              {p.caption && <span className="plate-caption">{p.caption}</span>}
              {!!p.badges?.length && (
                <span className="plate-badges">
                  {p.badges.map((b) => (
                    <Display key={b.text} kind="badge" icon={b.icon} text={b.text} variant={b.variant} />
                  ))}
                </span>
              )}
            </Control>
            {!!p.actions?.length && (
              <div className="plate-actions">
                {p.actions.map((action) => (
                  <Control
                    key={action.key}
                    kind="button"
                    size="sm"
                    variant={action.variant ?? "dark"}
                    icon={action.icon}
                    label={action.label}
                    onPress={() => {
                      scene.current?.react(p.key, "hop");
                      return action.onPress();
                    }}
                  >
                    {action.text}
                  </Control>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
