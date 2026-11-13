import { test } from "node:test";
import assert from "node:assert/strict";
import { Engine } from "../shared/engine";
import type { Member } from "../shared/types";
import type { GameBridge } from "../client/src/game";
import { PresentationEvents } from "../client/src/gameStore";
import { installStickRouter } from "../client/src/ui/game/touchRouter";

/** Minimal event target; these are simulated pointers, not physical touch. */
class Events {
  listeners = new Map<string, Set<(event: any) => void>>();
  addEventListener(type: string, listener: (event: any) => void) {
    const group = this.listeners.get(type) ?? new Set();
    group.add(listener);
    this.listeners.set(type, group);
  }
  removeEventListener(type: string, listener: (event: any) => void) {
    this.listeners.get(type)?.delete(listener);
  }
  emit(type: string, event: unknown = {}) {
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }
}

class ElementStub {
  dataset: Record<string, string> = {};
  style: Record<string, any> = {
    setProperty(name: string, value: string) {
      this[name] = value;
    },
  };
  attrs = new Map<string, string>();
  thumb: ElementStub | null = null;
  constructor(public role = "") {}
  querySelector(selector: string) {
    return selector === ".ui-stick-thumb" ? this.thumb : null;
  }
  closest(selector: string) {
    return selector === `[data-stick="${this.role}"]` ? this : null;
  }
  setAttribute(name: string, value: string) {
    this.attrs.set(name, value);
  }
  getAttribute(name: string) {
    return this.attrs.get(name) ?? null;
  }
  hasAttribute(name: string) {
    return this.attrs.has(name);
  }
  removeAttribute(name: string) {
    this.attrs.delete(name);
  }
  remove() {}
}

test("simulated touch router keeps move and item aim independent and cancels safely", () => {
  const globals = [
    "window",
    "document",
    "matchMedia",
    "getComputedStyle",
  ] as const;
  const originals = new Map(
    globals.map((key) => [
      key,
      Object.getOwnPropertyDescriptor(globalThis, key),
    ]),
  );
  const win = new Events() as Events & {
    innerWidth: number;
    innerHeight: number;
  };
  win.innerWidth = 844;
  win.innerHeight = 390;
  const doc = new Events() as Events & {
    hidden: boolean;
    documentElement: ElementStub;
    createElement: () => ElementStub;
  };
  doc.hidden = false;
  doc.documentElement = new ElementStub();
  doc.createElement = () => new ElementStub();
  for (const [key, value] of Object.entries({
    window: win,
    document: doc,
    matchMedia: () => ({ matches: true }),
    getComputedStyle: () => ({
      paddingLeft: "0",
      paddingRight: "0",
      paddingTop: "0",
      paddingBottom: "0",
    }),
  }))
    Object.defineProperty(globalThis, key, {
      value,
      configurable: true,
      writable: true,
    });

  const controls = new Map(
    ["move", "attack", "super", "item"].map((role) => {
      const el = new ElementStub(role);
      el.thumb = new ElementStub();
      return [role, el];
    }),
  );
  const root = {
    querySelector(selector: string) {
      return (
        controls.get(selector.match(/data-stick="(\w+)"/)?.[1] ?? "") ?? null
      );
    },
    appendChild() {},
    style: { setProperty() {} },
  };
  const members: Member[] = [
    {
      id: "me",
      name: "Me",
      fighter: "brandon",
      team: 0,
      ready: true,
      connected: true,
    },
    {
      id: "other",
      name: "Other",
      fighter: "brandon",
      team: 1,
      ready: true,
      connected: true,
    },
  ];
  const match = new Engine("broomball", members, () => 0.5).state;
  const self = match.players[0];
  self.pos = { x: 10, y: 10 };
  match.players[1].pos = { x: 13, y: 10 };
  const broom = match.items.find((item) => item.kind === "golden_broom")!;
  broom.state = "carried";
  broom.carrier = self.id;
  self.heldItem = broom.id;
  match.ball.pos = { x: 10, y: 12 };
  match.ball.state = "free";
  const bridge: GameBridge = {
    match,
    events: new PresentationEvents(),
    id: self.id,
    input: { move: { x: 0, y: 0 }, aim: { x: 1, y: 0 } },
    spectate: null,
    send() {},
    paused: false,
    aiming: null,
  };
  const pointer = (
    type: string,
    id: number,
    x: number,
    y: number,
    target = new ElementStub(),
  ) => {
    const event = {
      pointerId: id,
      pointerType: "touch",
      button: 0,
      clientX: x,
      clientY: y,
      target,
      preventDefault() {},
    };
    win.emit(type, event);
  };
  let dispose: (() => void) | undefined;
  try {
    dispose = installStickRouter({
      root: root as unknown as HTMLElement,
      bridge,
      superBlocked: () => null,
      attackEmpty: () => false,
      carrying: () => false,
    });
    pointer("pointerdown", 1, 100, 250);
    pointer("pointermove", 1, 130, 250);
    assert.ok(bridge.input.move.x > 0);

    const item = controls.get("item")!;
    pointer("pointerdown", 2, 760, 195, item);
    pointer("pointermove", 2, 760, 155, item);
    assert.equal(bridge.aiming, "item");
    assert.ok(bridge.input.aim.y < -0.99);
    pointer("pointerup", 2, 760, 155, item);
    assert.equal(bridge.input.itemUse, true);
    assert.ok(
      bridge.input.move.x > 0,
      "item release must not stop the other finger",
    );
    pointer("pointerup", 1, 130, 250);
    assert.deepEqual(bridge.input.move, { x: 0, y: 0 });

    bridge.input.itemUse = false;
    pointer("pointerdown", 3, 760, 195, item);
    pointer("pointerup", 3, 760, 195, item);
    assert.equal(bridge.input.itemUse, true);
    assert.ok(bridge.input.aim.y > 0.99, "tap auto-aims at the nearer ball");

    bridge.input.itemUse = false;
    pointer("pointerdown", 6, 760, 195, item);
    pointer("pointermove", 6, 760, 155, item);
    pointer("pointercancel", 6, 760, 155, item);
    assert.equal(
      bridge.input.itemUse,
      false,
      "cancelled gestures must not fire",
    );
    assert.equal(bridge.aiming, null);

    pointer("pointerdown", 4, 100, 250);
    pointer("pointermove", 4, 130, 250);
    pointer("pointerdown", 5, 760, 195, item);
    win.emit("blur");
    assert.equal(
      bridge.input.itemUse,
      false,
      "focus loss must not fire the item",
    );
    assert.deepEqual(bridge.input.move, { x: 0, y: 0 });
    assert.equal(bridge.aiming, null);

    pointer("pointerdown", 7, 100, 250);
    pointer("pointermove", 7, 130, 250);
    pointer("pointerdown", 8, 760, 195, item);
    doc.hidden = true;
    doc.emit("visibilitychange");
    assert.equal(
      bridge.input.itemUse,
      false,
      "backgrounding must not fire the item",
    );
    assert.deepEqual(bridge.input.move, { x: 0, y: 0 });
    assert.equal(bridge.aiming, null);
  } finally {
    dispose?.();
    for (const key of globals) {
      const original = originals.get(key);
      if (original) Object.defineProperty(globalThis, key, original);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});
