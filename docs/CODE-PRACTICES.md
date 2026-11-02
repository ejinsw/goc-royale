# GOC Royale code practices

**Status:** Mandatory repository standard
**Applies to:** `client/src/`, `shared/`, `tests/`, and any new client code
**Last updated:** October 31, 2026

This document defines how code is structured so the project grows by
extending a small number of shared systems instead of adding one-off code for
every request. It complements, and never overrides,
`docs/PERFORMANCE-AND-GAMEPLAY-STANDARDS.md`. Where the two conflict, the
performance standard wins.

## 1. General principles

1. **Extend before adding.** Before writing a new component, class, hook, or
   module, find the existing system it belongs to and extend it with a variant,
   option, or configuration entry. A new building block needs a stated reason
   why the existing ones cannot express it.
2. **One interface per concept.** Each concept (a control, a meter, a
   notification, a sound cue, a screen) has one public interface. Variations are
   data passed to that interface, not parallel implementations.
3. **Configuration over code.** Look, size, sound, motion, and behavior
   differences are expressed as variant or profile entries in a central table.
   Screens and features pick entries by name; they do not restyle or re-implement.
4. **Layered inheritance.** Shared behavior lives in a base layer. Specialized
   layers extend the base and add capability. They never copy it. In React
   this is done with factory extension and composition (section 3), not with
   class hierarchies of components.
5. **A prompt is not a module boundary.** A new feature request does not justify
   a new file, class, or component family by itself. Add to the system the
   feature belongs to.
6. **Name the owner.** Every module states which layer of the runtime table
   (performance standard §3) it belongs to and does not reach into another
   layer's responsibilities.
7. **One way.** Every feature has one implementation for every device and
   environment. There are no device tiers, quality modes, desktop-only or
   mobile-only variants, and no development-only or production-only paths for
   the same feature. Adapt inside that one implementation from measured input:
   viewport size, orientation, and the input type actually used. Handling a
   missing capability (for example WebGL failing to start) is allowed only if
   it leaves the same interface usable; it is not a second design.

## 2. UI architecture overview

All player-facing interface code lives in `client/src/ui/` and is built from
exactly two kits. Both come from one factory.

```text
ui/core      tokens, tactile feedback engine, base Control, base Display
   │
   ├── createKit(config)  ──►  menuKit   (menus, lobby, results, settings)
   │
   └── extendKit(menuKit, gameConfig) ──► gameKit  (match HUD, touch controls)
                                              adds: signal binding to the
                                              game store and event stream
```

| Layer | Owns | Must not own |
|---|---|---|
| `ui/core` | Design tokens, the tactile feedback engine, the base `Control` behavior and base `Display` behavior | Screen layout, game state, copy |
| `menuKit` | Every menu control and display, built as variants of the core | Game-state subscriptions, per-frame updates |
| `gameKit` | Everything in `menuKit`, plus signal binding and reactive feedback driven by game state and events | Authoritative state, renderer objects |
| `ui/screens` | Composition and layout of kit components into screens | Custom control styling or behavior |
| `ui/scene` | The 3D menu backdrop renderer | Gameplay, arena rendering, React state |

Screens compose kit components and own only layout. A screen that needs a
control the kit cannot express extends the kit (section 4). It does not build
a private control.

## 3. The single control interface

Every interactive element is one `Control`, and every non-interactive element
is one `Display`. Buttons, icon buttons, text fields, toggles, sliders, choice
pickers, sticks, and tabs are **kinds and variants of `Control`**. Panels,
badges, meters, labels, callouts, and toasts are **kinds and variants of
`Display`**.

### 3.1 Control contract

Each control is declared once as a kind in the kit configuration:

```ts
interface ControlKind<Value> {
  input: "press" | "text" | "toggle" | "range" | "choice" | "stick";
  variants: Record<string, VariantTokens>;   // e.g. primary, secondary, quiet, danger
  sizes: Record<string, SizeTokens>;         // e.g. sm, md, lg, hero
  feedback: FeedbackProfileName;             // tactile profile, section 5
  sound?: UiCue;                             // press / confirm / deny / focus cues
}

interface ControlProps<Value> {
  kind: string;            // key into the kit's control kinds
  variant?: string;
  size?: string;
  value?: Value;
  onCommit?: (value: Value) => void | "deny";
  disabled?: boolean | string;   // a string is the reason shown on deny
  icon?: IconName;
  label: string;           // always present; may be visually hidden
}
```

- The kit exports named shortcuts (`Button`, `TextField`, `Toggle`, `Slider`,
  `Choice`, `Stick`). Each one is the base `Control` with a fixed `kind`. They
  are not separate implementations.
- All controls share one internal state machine:
  `idle → hover/focus → pressed → released → (confirmed | denied) → idle`, plus
  `disabled` and `busy`. State is exposed as `data-state` attributes and CSS
  custom properties so styling and motion never need React re-renders.
- Keyboard, mouse, touch, and gamepad-style focus all drive the same state
  machine. Every control is reachable and operable by keyboard.

### 3.2 Display contract

```ts
interface DisplayProps<Value> {
  kind: string;            // panel, badge, meter, label, callout, ...
  variant?: string;
  value?: Value;           // static value (menuKit) ...
  signal?: SignalRef<Value>; // ... or a live binding (gameKit only)
  emphasis?: "none" | "pulse" | "alert";
}
```

The meter is one display kind with modes (`bar`, `pips`, `ring`), not one
component each for health, ammo, and Super. The same rule applies to callouts:
match notices, elimination feed rows, toasts, and goal banners are variants of
one `callout` display.

## 4. Extending the kits

Allowed, in order of preference:

1. **Use an existing kind and variant.**
2. **Add a variant or size entry** to the kit configuration.
3. **Add a feedback profile or sound cue** to the shared tables.
4. **Add a new kind** to `menuKit`, or to `gameKit` if it needs game signals,
   built on the base `Control` or `Display`. The pull request must state why
   steps 1–3 were insufficient.
5. **Add a new core capability** to `ui/core`. This is only for behavior that
   every kit needs, and it requires updating this document.

Prohibited:

- A component that re-implements press, focus, or feedback behavior outside
  `ui/core`.
- Screen-local CSS that restyles a kit control. Screens may set layout
  properties (position, grid, gap, order) only.
- Copying a kit component to make a slightly different one.
- Creating a new kit beyond `menuKit` and `gameKit` without an explicit user
  decision recorded in this document.

## 5. Tactile feedback standard

Controls must feel physical. Pressing something must never just make a
result happen with no response from the control itself.

### 5.1 Feedback phases

Every pressable control plays, through the shared feedback engine:

| Phase | Trigger | Required response | Timing |
|---|---|---|---|
| Hover / focus | Pointer over or keyboard focus | Lift, highlight, or outline change | 80–120 ms |
| Press | Pointer down or key down | Visible depression (scale and/or depth drop) and press cue | Visible on the **same frame** as the input; ≤ 16 ms |
| Release | Pointer up or key up | Spring back with small overshoot | 120–200 ms |
| Confirm | Action accepted | Short pulse, flash, or shape change, plus confirm cue | 120–250 ms |
| Deny | Disabled, invalid, or rejected | Short shake or bump, plus deny cue and reason text if available | 150–250 ms |
| Busy | Waiting on network or async work | Persistent but calm motion until resolved | Until resolved |

- Feedback is predicted locally, the same as gameplay cues (performance
  standard §4.1). A control never waits for a network round trip before
  responding. The confirm phase plays when the result is known and may follow
  `busy`.
- Disabled controls still respond to presses with the deny phase. They are
  never silent dead zones.
- Text fields have their own phases: focus (lift and caret), typing (subtle
  per-key response, no layout shift), valid/invalid (shape and icon, not color
  alone), and submit (confirm or deny).
- Profiles (`soft`, `punchy`, `heavy`, `stick`, ...) are named entries in one
  table. A control picks a profile by name and does not hand-tune timings.

### 5.2 Visual language

- Plain but punchy: flat shapes, chunky depth edges, big condensed type, short
  confident motion.
- The interface palette is **blue plus greys and black only** (user decision,
  October 31, 2026). Fighters keep their own colors on their models and
  portraits; interface chrome does not borrow them.
- Team identity in the interface uses shape and text (`▲ BLUE`, `◆ RED`), not
  a second accent color.
- All colors, sizes, depths, and timings come from `ui/core/tokens.ts`.

### 5.3 Motion and accessibility

- Animate only `transform`, `opacity`, and CSS custom properties consumed by
  them. Use CSS transitions or the Web Animations API. No layout-affecting
  animation, and no DOM measurement during a match.
- Reduced motion (`prefers-reduced-motion` and the in-game setting) replaces
  scale, shake, and overshoot with value and opacity changes. Sound cues and
  state changes remain.
- Haptics (`navigator.vibrate`) are optional, short, gated by a setting, and
  never the only feedback.
- UI sounds go through `client/src/audio.ts` as named UI cue categories (art
  direction §9). Audio nodes must not be created in per-frame paths.

## 6. Game kit reactivity

`gameKit` adds one capability on top of `menuKit`: binding any control or
display to game state and game events through **signals**.

```ts
interface SignalRef<T> {
  read(): T;                                   // current derived value
  subscribe(onChange: (next: T, prev: T) => void): () => void;
}
```

- Signals derive from `GameStore` snapshots and the presentation event stream
  (`GameEvent`, performance standard §6.2). Examples: local HP, ammo, Super
  charge, carrier state, zone proximity, hit taken, elimination, goal.
- **Continuous values** (meter fill, cooldown sweep, stick thumb, damage
  flash) are written straight to element refs or CSS custom properties from
  the signal callback. They MUST NOT call React state setters.
- **Structural changes** (alive vs. spectating, mode, phase) may re-render
  React, and only through `useGameSelector` at ≤ 10 Hz or on change.
- **Event reactions** (hit shake on the HP meter, Super-ready burst, low-HP
  pulse, goal banner) are emphasis triggers on existing displays, chosen by
  event type from one reaction table. They are not new components per event.
- Reactions scale by importance and respect the reduced-motion and screen-shake
  settings (performance standard §6.1).
- Critical state is never communicated by color alone (performance standard
  §8.1).

### 6.1 Touch sticks

- Move, attack, and Super are one `stick` control kind with three variants.
  One touch router owns all of them, so multi-touch, cancellation, and
  focus loss are handled in one place.
- Move and attack sticks **float**: each appears where the thumb lands inside
  its half of the screen, clamped so the whole stick stays inside the safe
  area. When released, it returns to a resting position at the bottom corner.
- Super is fixed above and inside the attack resting position so it can be
  found without looking. A tap on attack or Super auto-aims; a drag aims.
- Stick size scales with the short side of the viewport and is clamped to a
  comfortable thumb size. It is recomputed only on resize, never per frame.
- Touch input always drives the sticks and mouse/keyboard always drive the
  desktop controls. There is no setting that switches between two control
  implementations.

## 7. 3D menu scene

The menu backdrop is a live 3D scene behind the menu GUI. The GUI is regular
`menuKit` DOM overlaid on top of it.

- **One live renderer at a time.** The menu scene is lazy-loaded and fully
  disposed (renderer, geometries, materials, textures, animation mixers,
  listeners) before the match renderer mounts. It must never run at the same
  time as the arena (performance standard §5.2).
- **The GUI does not wait for the scene.** Menus are interactive before the 3D
  scene finishes loading. If WebGL cannot start, the same screens keep working
  over the plain background and the name plates fall back to normal page flow.
  There is no separate low-power or static-image design.
- The same scene runs on every device. It pauses when the tab is hidden and
  caps device pixel ratio at 2 everywhere.
- Fighters on the stage are procedural low-poly models built by one factory
  from a per-fighter look table that mirrors each fighter's 2D portrait. Adding
  a fighter means adding a table entry, not a new model class.
- The stage shows every party member: up to 10 in Showdown and up to 6 in
  Broomball, grouped by team. The camera frames the group to the area each
  screen leaves free, in portrait and landscape.
- Scene content (fighters on the stage, camera moves, reactions to menu
  actions) is driven through one scene interface, e.g.
  `scene.show({ fighters, focus, mood })`, not by screens touching renderer
  objects.
- 3D assets used in the menu are subject to the performance standard §7.3
  budgets. The menu scene's added cold-load payload, frame time, and teardown
  must be measured and recorded in `docs/STATUS.md` before it ships.

## 8. File layout

```text
client/src/ui/
  core/      tokens.ts, feedback.ts, control.tsx, display.tsx, kit.ts
  menu/      menuKit.ts (configuration of kinds, variants, profiles)
  game/      gameKit.ts (extends menuKit), signals.ts, reactions.ts
  scene/     menuScene.ts (3D backdrop; no React state)
  screens/   home, lobby, results, settings, matchHud (composition only)
  ui.css     token variables and kit styles (no screen-specific control styles)
```

## 9. Review checklist

Answer these before completing any UI change:

1. Which existing kit kind and variant does this use? If a new one was added,
   why could the existing ones not express it?
2. Does every new pressable element go through the base `Control` and a named
   feedback profile?
3. Does any continuous game value reach React state? It must not.
4. Does the change work by keyboard, by touch, and with reduced motion?
5. Does any screen restyle a kit control locally? It must not.
6. Is only one renderer live at a time, and does the menu scene tear down
   cleanly?
7. Was this document updated if a core capability or a new kit kind was added?
