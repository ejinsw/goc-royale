import type { PerspectiveCamera } from "three";
import {
  AREAS,
  FIGHTERS,
  shotPoint,
  type FighterId,
  type Vec,
} from "../../../shared/definitions";
import type { Effect, Match, Player } from "../../../shared/types";
import { uiCue } from "../audio";
import { lobHeight, PROJECTILE_Y, type Effects } from "./fx";
import type { ArenaMaterials } from "./materials";
import { MOTION } from "./motion";
import {
  Atlas,
  SpriteShow,
  basicSprites,
  rand,
  type Particle,
  type ShowFrame,
} from "./showkit";

/**
 * The roster showcase: every fighter except Brandon Nguyen (who has his own
 * show, `swiper.ts`) gets a themed version of each beat (performance
 * standard §6: anticipation, release, impact, recovery):
 *
 * - **Landing**: at the match start each fighter drops in with their own
 *   landing clip (`MOTION.respawn`), a dust shockwave, their icons and, on
 *   their own screen, their name and team slammed in under a spotlight.
 *   Respawns play a short version.
 * - **Attack**: a themed release burst and word; projectiles leave themed
 *   trails (Dylan's line stays tethered to his rod).
 * - **Hit landed** and **hit taken**: themed impact sprites and words; the
 *   hurt fighter's icons scatter and fly back.
 * - **Super**: a windup on the press, then a payoff when it resolves, with
 *   a banner, rings and a themed flourish.
 * - **Knockout** and **victory**: a themed defeat (a soul rises, pieces
 *   scatter) and a themed fireworks show on knockouts and goals.
 * - **Ambient**: movement trails, a Super-ready orbit, low-health sweat.
 *
 * Presentation only (§3): it reads the snapshot and the authoritative
 * effects the view already receives. One theme row per fighter
 * (docs/CODE-PRACTICES.md §1.3); the bespoke flourishes are that row's
 * scripts, built on the shared `SpriteShow` blocks.
 *
 * Budget (§5.2): one atlas holding only the fighters in the match (2048
 * wide, at most 2048 tall), the two instanced draws and the invert quad of
 * `SpriteShow`, and a fixed pool of `CAP` particles that recycles when full.
 */

type RosterId = Exclude<FighterId, "brandon_n">;
type WordKey = "title" | "tag" | "attack" | "hit" | "hurt" | "down" | "super" | "win";

interface Theme {
  color: number;
  accent: number;
  /** Emoji icons: [signature, secondary, impact, extra]. */
  icons: readonly string[];
  /** Which icon trails movement and projectiles; -1 trails a colored glow. */
  trail: number;
  words: Record<WordKey, string>;
  /** More words a script stamps, by key. */
  extra?: Record<string, string>;
  /** `show_*` cue names, and a pitch for this fighter. */
  voice: { attack: string; hit: string; super: string; pitch: number };
  /** The Super resolves on the press with no effect of its own (a team heal). */
  instant?: boolean;
}

const THEMES: Record<RosterId, Theme> = {
  brandon: {
    color: 0x417bc2,
    accent: 0xffd86e,
    icons: ["🏷️", "👋", "📋", "🎈"],
    trail: 1,
    words: {
      title: "BRANDON",
      tag: "WELCOME & FOLLOW-UP",
      attack: "HELLO!",
      hit: "TAGGED!",
      hurt: "WHO ARE YOU?!",
      down: "SEE YOU SUNDAY",
      super: "WELCOME!",
      win: "NEW FRIEND!",
    },
    voice: { attack: "whoosh", hit: "pop", super: "chime", pitch: 1 },
  },
  daniel: {
    color: 0x83b5ef,
    accent: 0xffdc76,
    icons: ["🔑", "🚐", "💨", "🚙"],
    trail: 2,
    words: {
      title: "DANIEL",
      tag: "RIDES TEAM",
      attack: "JINGLE!",
      hit: "CLINK!",
      hurt: "FENDER BENDER",
      down: "OUT OF GAS",
      super: "FULL CARPOOL!",
      win: "SHOTGUN!",
    },
    extra: { beep: "BEEP BEEP!" },
    voice: { attack: "jingle", hit: "bonk", super: "honk", pitch: 0.9 },
  },
  rich: {
    color: 0xb9a3ee,
    accent: 0xffffff,
    icons: ["📸", "🎞️", "✨", "🌟"],
    trail: 2,
    words: {
      title: "RICH",
      tag: "MEDIA TEAM",
      attack: "CLICK!",
      hit: "SNAP!",
      hurt: "BLURRY!",
      down: "OVEREXPOSED",
      super: "SAY CHEESE!",
      win: "FRAMED!",
    },
    extra: { far: "NICE SHOT!" },
    voice: { attack: "shutter", hit: "flash", super: "shutter", pitch: 1 },
  },
  samuel: {
    color: 0xf5d46e,
    accent: 0xd8994c,
    icons: ["🍪", "🍿", "🥨", "🧃"],
    trail: 0,
    words: {
      title: "SAMUEL",
      tag: "CARE TEAM",
      attack: "SNACK TIME!",
      hit: "CRUNCH!",
      hurt: "CRUMBS!",
      down: "OUT OF SNACKS",
      super: "MIDTERM MUNCHIES!",
      win: "EVERYONE'S FED!",
    },
    extra: { heal: "YUM!" },
    voice: { attack: "whoosh", hit: "crunch", super: "pop", pitch: 1.05 },
  },
  josh: {
    color: 0xf5a474,
    accent: 0xffe36e,
    icons: ["🔊", "🎵", "⚡", "🎚️"],
    trail: 1,
    words: {
      title: "JOSH",
      tag: "SOUND TEAM",
      attack: "MIC CHECK!",
      hit: "FEEDBACK!",
      hurt: "MUTED!",
      down: "SIGNAL LOST",
      super: "SOUNDCHECK!",
      win: "ENCORE!",
    },
    extra: { count: "ONE, TWO, ONE TWO" },
    voice: { attack: "feedback", hit: "thud", super: "boom", pitch: 1 },
  },
  elijah: {
    color: 0x77d5b9,
    accent: 0x1f3a37,
    icons: ["🐛", "💻", "💥", "⏪"],
    trail: -1,
    words: {
      title: "ELIJAH",
      tag: "WEB TEAM",
      attack: "BUG REPORT!",
      hit: "CRASH!",
      hurt: "ERROR 404",
      down: "SEGFAULT",
      super: "ROLLBACK!",
      win: "SHIPPED!",
    },
    extra: { deploy: "DEPLOYING..." },
    voice: { attack: "glitch", hit: "glitch", super: "rewind", pitch: 1 },
  },
  ethan: {
    color: 0xdf83c8,
    accent: 0xffd1f0,
    icons: ["🎸", "🎵", "💖", "✨"],
    trail: 2,
    words: {
      title: "ETHAN",
      tag: "MUSIC TEAM",
      attack: "RIZZ",
      hit: "RIZZED!",
      hurt: "LEFT ON READ",
      down: "FUMBLED",
      super: "AURA",
      win: "W RIZZ",
    },
    voice: { attack: "strum", hit: "chime", super: "strum", pitch: 1 },
  },
  david: {
    color: 0x4f7fd1,
    accent: 0xf2c65d,
    icons: ["🎤", "🎶", "👀", "✨"],
    trail: 1,
    words: {
      title: "DAVID",
      tag: "MUSIC TEAM",
      attack: "AHHH~",
      hit: "PITCH PERFECT",
      hurt: "OFF KEY!",
      down: "VOICE CRACK",
      super: "SIDE EYE",
      win: "BRAVO!",
    },
    extra: { harmony: "HARMONY!" },
    voice: { attack: "hum", hit: "chime", super: "hum", pitch: 1 },
  },
  dylan: {
    color: 0x2a8fd6,
    accent: 0xc9b98a,
    icons: ["🎣", "🐟", "💧", "🌊"],
    trail: 2,
    words: {
      title: "DYLAN",
      tag: "FISHERMAN'S",
      attack: "CAST!",
      hit: "HOOKED!",
      hurt: "SNAGGED!",
      down: "THE ONE THAT GOT AWAY",
      super: "FISHERS OF MEN!",
      win: "CATCH OF THE DAY",
    },
    voice: { attack: "whoosh", hit: "reel", super: "splash", pitch: 1 },
  },
  isaac: {
    color: 0x8d6e63,
    accent: 0xd7dde4,
    icons: ["📎", "📋", "📄", "✅"],
    trail: 2,
    words: {
      title: "ISAAC",
      tag: "ADMIN TEAM",
      attack: "CLACK CLACK CLACK",
      hit: "FILED!",
      hurt: "PAPER JAM",
      down: "OUT OF OFFICE",
      super: "ROOM SETUP!",
      win: "APPROVED",
    },
    extra: { checked: "CHECKED IN" },
    voice: { attack: "clack", hit: "clack", super: "thud", pitch: 1 },
  },
  tovya: {
    color: 0x9ead2c,
    accent: 0xffb35c,
    icons: ["🥣", "🍲", "♨️", "🥖"],
    trail: 2,
    words: {
      title: "TOVYA",
      tag: "HOMELESS OUTREACH",
      attack: "SOUP'S ON!",
      hit: "BONK!",
      hurt: "SPILL!",
      down: "KITCHEN CLOSED",
      super: "DINNER'S READY!",
      win: "SECONDS?",
    },
    voice: { attack: "whoosh", hit: "bonk", super: "boom", pitch: 0.85 },
  },
  rosalie: {
    color: 0xe8553a,
    accent: 0xfbe8d3,
    icons: ["🐼", "🌸", "🤗", "💌"],
    trail: 1,
    words: {
      title: "ROSALIE",
      tag: "WELCOME & FOLLOW-UP",
      attack: "WELCOME!",
      hit: "HUGGED!",
      hurt: "AWKWARD...",
      down: "FOLLOWED UP",
      super: "PANDA TIME!",
      win: "SO GLAD YOU CAME!",
    },
    voice: { attack: "whoosh", hit: "pop", super: "pop", pitch: 1.15 },
  },
  joelle: {
    color: 0xffb300,
    accent: 0xffcf55,
    icons: ["🚗", "🔁", "⭐", "💨"],
    trail: 3,
    words: {
      title: "JOELLE",
      tag: "RIDES TEAM",
      attack: "ROUND TRIP!",
      hit: "PICKED UP!",
      hurt: "WRONG TURN",
      down: "RIDE CANCELLED",
      super: "MIX IT UP!",
      win: "ARRIVED!",
    },
    voice: { attack: "whistle", hit: "pop", super: "whoosh", pitch: 1.1 },
  },
  susannah: {
    color: 0xff6f91,
    accent: 0xfff6fa,
    icons: ["📱", "❤️", "👍", "👕"],
    trail: 1,
    words: {
      title: "SUSANNAH",
      tag: "MEDIA TEAM",
      attack: "POSTED!",
      hit: "LIKED!",
      hurt: "UNFOLLOWED",
      down: "ACCOUNT DELETED",
      super: "MERCH DROP!",
      win: "TRENDING!",
    },
    extra: { viral: "GONE VIRAL!" },
    voice: { attack: "ding", hit: "pop", super: "ding", pitch: 1.1 },
  },
  joyce: {
    color: 0x2e9e5b,
    accent: 0xfffdf4,
    icons: ["💌", "💚", "🎄", "🎁"],
    trail: 1,
    words: {
      title: "JOYCE",
      tag: "CARE TEAM",
      attack: "WITH LOVE!",
      hit: "DELIVERED!",
      hurt: "RETURN TO SENDER",
      down: "SIGNED, SEALED",
      super: "CHRISTMAS GRAMS!",
      win: "THANK YOU!",
    },
    voice: { attack: "flutter", hit: "chime", super: "chime", pitch: 1.05 },
    instant: true,
  },
  miriam: {
    color: 0x7e57c2,
    accent: 0xfbfbf7,
    icons: ["🕊️", "📖", "☮️", "🤍"],
    trail: 3,
    words: {
      title: "MIRIAM",
      tag: "PRAYER TEAM",
      attack: "PEACE",
      hit: "BE CALM",
      hurt: "OOF",
      down: "AT REST",
      super: "BE STILL.",
      win: "PEACE BE WITH YOU",
    },
    voice: { attack: "flutter", hit: "chime", super: "choir", pitch: 1 },
  },
  jemuel: {
    color: 0xc2185b,
    accent: 0xffd86e,
    icons: ["🏮", "☀️", "✨", "🛡️"],
    trail: 2,
    words: {
      title: "JEMUEL",
      tag: "PRAYER TEAM",
      attack: "RISE & SHINE",
      hit: "BLESSED",
      hurt: "SHADE!",
      down: "LIGHTS OUT",
      super: "COVERED!",
      win: "GLORY!",
    },
    voice: { attack: "chime", hit: "sparkle", super: "choir", pitch: 0.95 },
  },
  russell: {
    color: 0x7cb342,
    accent: 0xf3c26b,
    icons: ["💰", "💵", "🧾", "📉"],
    trail: 1,
    words: {
      title: "RUSSELL",
      tag: "FINANCE TEAM",
      attack: "REIMBURSED!",
      hit: "CHA-CHING!",
      hurt: "OVERDRAFT!",
      down: "BANKRUPT",
      super: "BUDGET CUTS!",
      win: "PROFIT!",
    },
    extra: { heal: "REFUND +$" },
    voice: { attack: "coin", hit: "coin", super: "boom", pitch: 1 },
  },
};

const isRoster = (id: FighterId): id is RosterId => id !== "brandon_n";
const CAP = 900;
/**
 * World text lanes, clear of the nameplate (about 2.9 up) and the damage
 * number that rises to about 3.2: a fighter's own words, then words above
 * the rival they hit, then banners.
 */
const SELF_Y = 3.6;
const TARGET_Y = 4;
const BANNER_Y = 4.4;
const RED = 0xff4d5e;
const WHITE = 0xffffff;
const SWEAT = "💦";
const EMOJI_FONT = (px: number) =>
  `${px}px 'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji', sans-serif`;

/** Some devices draw emoji as empty boxes; then icons become colored badges. */
function emojiDraws() {
  try {
    const c = document.createElement("canvas");
    c.width = c.height = 20;
    const g = c.getContext("2d")!;
    g.font = EMOJI_FONT(16);
    g.textBaseline = "middle";
    g.fillText("🔑", 1, 10);
    const d = g.getImageData(0, 0, 20, 20).data;
    for (let i = 0; i < d.length; i += 4)
      if (d[i + 3] > 40 && Math.max(Math.abs(d[i] - d[i + 1]), Math.abs(d[i + 1] - d[i + 2])) > 40)
        return true;
    return false;
  } catch {
    return true;
  }
}

const hexCss = (n: number) => "#" + n.toString(16).padStart(6, "0");

function buildAtlas(fighters: readonly RosterId[]) {
  const atlas = new Atlas(2048);
  basicSprites(atlas.add);
  const color = emojiDraws();
  const icons = new Map<string, number>();
  for (const id of fighters)
    for (const ch of THEMES[id].icons) if (!icons.has(ch)) icons.set(ch, THEMES[id].color);
  icons.set(SWEAT, 0x8bc7ff);
  for (const [ch, tint] of icons)
    atlas.add("i" + ch, 88, 88, (g, w, h) => {
      g.textAlign = "center";
      g.textBaseline = "middle";
      if (!color) {
        // A badge in the fighter's color when emoji cannot draw.
        g.fillStyle = "rgba(11,14,20,0.9)";
        g.beginPath();
        g.arc(w / 2, h / 2, 38, 0, 7);
        g.fill();
        g.fillStyle = hexCss(tint);
        g.beginPath();
        g.arc(w / 2, h / 2, 32, 0, 7);
        g.fill();
        return;
      }
      g.font = EMOJI_FONT(66);
      // A dark halo keeps every icon readable on grass and on night ice.
      g.shadowColor = "rgba(11,14,20,0.85)";
      g.shadowBlur = 7;
      g.fillText(ch, w / 2, h / 2 + 4);
      g.shadowBlur = 0;
      g.fillText(ch, w / 2, h / 2 + 4);
    });
  atlas.text("ready", "SUPER READY!", 60, true);
  for (const id of fighters) {
    const th = THEMES[id];
    for (const key of ["attack", "hit", "hurt", "super", "down", "win"] as const)
      atlas.text(`${id}:${key}`, th.words[key], 64, key === "hit" || key === "super");
    for (const [key, text] of Object.entries(th.extra ?? {}))
      atlas.text(`${id}:${key}`, text, 60, true);
  }
  // Titles last: they matter only for the entrance, so they give way first.
  for (const id of fighters) {
    atlas.text(`${id}:title`, THEMES[id].words.title, 96);
    atlas.text(`${id}:tag`, THEMES[id].words.tag, 46, true);
  }
  return atlas.build();
}

interface Star {
  id: string;
  fighter: RosterId;
  theme: Theme;
  x: number;
  z: number;
  hp: number;
  alive: boolean;
  kills: number;
  ready: boolean;
  idle: number;
  trail: number;
  flourishAt: number;
  sweatAt: number;
  squashAt: number;
  squash: number;
  windupAt: number;
  payoffAt: number;
  wordAt: number;
  hitWordAt: number;
  hurtAt: number;
  combo: number;
}

/** What a particle bursts into when it dies: `p.die - 1` indexes this list. */
interface DieKind {
  sprite: string;
  n: number;
  hex: number;
}

export class RosterShow extends SpriteShow {
  /** The roster fighters this show's atlas was built for. */
  readonly fighters: ReadonlySet<FighterId>;
  private stars = new Map<string, Star>();
  private seenAreas = new Set<number>();
  private shotTrail = new Map<number, number>();
  private dies: DieKind[] = [];
  private score: [number, number] = [0, 0];
  private matchTime = 0;

  constructor(
    mats: ArenaMaterials,
    camera: PerspectiveCamera,
    fx: Effects,
    shakeView: (ms: number, intensity: number, now: number) => void,
    match: Match,
  ) {
    const ids = [...new Set(match.players.map((p) => p.fighter))].filter(isRoster);
    super(mats, camera, fx, shakeView, buildAtlas(ids), CAP);
    this.fighters = new Set(ids);
    this.sparkleHex = 0xffffff;
  }

  /** False when a fighter in this match is missing from the atlas. */
  covers(match: Match) {
    return match.players.every((p) => !isRoster(p.fighter) || this.fighters.has(p.fighter));
  }

  // ----------------------------------------------------------------- helpers

  private icon(s: Star, i: number) {
    return "i" + s.theme.icons[Math.min(i, s.theme.icons.length - 1)];
  }
  private word(s: Star, key: string) {
    return `${s.fighter}:${key}`;
  }
  private at(s: Star): Vec {
    return { x: s.x, y: s.z };
  }
  private voice(s: Star, name: string, gapMs = 70, pitch = 1) {
    uiCue("show_" + name, s.theme.voice.pitch * pitch, gapMs);
  }
  private squashStar(s: Star, amount: number) {
    s.squashAt = this.now;
    s.squash = amount;
  }
  squashOf(id: string, now: number) {
    const s = this.stars.get(id);
    if (!s) return 1;
    const t = now - s.squashAt;
    if (t < 0 || t > 0.45) return 1;
    return 1 + s.squash * Math.exp(-t * 9) * Math.cos(t * 30);
  }
  /** Screen banner for the fighter's own viewer, a world stamp for everyone else. */
  private banner(s: Star, key: string, hex: number, life = 1.2, y = 0.42, h = 0.17) {
    if (this.isFocus(s.id)) return this.slam(this.word(s, key), 0, y, h, life, hex);
    return this.stamp(this.word(s, key), this.at(s), BANNER_Y, 0.6, hex, life);
  }
  private dieKind(sprite: string, n: number, hex = WHITE) {
    let i = this.dies.findIndex((d) => d.sprite === sprite && d.n === n && d.hex === hex);
    if (i < 0) i = this.dies.push({ sprite, n, hex }) - 1;
    return i + 1;
  }
  protected onDie(p: Particle) {
    const d = this.dies[p.die - 1];
    if (!d) return;
    const flash = this.size(this.spawn("dot", p.x, p.y, p.z), 2.4);
    this.color(flash, d.hex);
    flash.add = true;
    flash.life = 0.2;
    flash.fade = 0;
    for (let i = 0; i < this.count(d.n); i++) {
      const c = this.size(this.spawn(d.sprite, p.x, p.y, p.z), rand(0.24, 0.4));
      const a = rand(0, Math.PI * 2),
        lift = rand(-1, 1),
        flat = Math.sqrt(1 - lift * lift) * rand(3, 5.5);
      c.vx = Math.cos(a) * flat;
      c.vz = Math.sin(a) * flat;
      c.vy = lift * 4.5;
      c.gravity = -5;
      c.drag = 1.6;
      c.spin = rand(-10, 10);
      c.life = rand(0.7, 1.2);
    }
    uiCue("show_pop", rand(0.8, 1.3), 90);
  }

  /** Spray `n` sprites out from a point. */
  private spray(
    name: string,
    x: number,
    y: number,
    z: number,
    n: number,
    o: {
      speed?: number;
      up?: [number, number];
      gravity?: number;
      size?: [number, number];
      life?: [number, number];
      /** Center heading (radians, ground plane) and half spread. */
      yaw?: number;
      spread?: number;
      hex?: number;
      add?: boolean;
      bounce?: number;
      home?: string;
      delay?: number;
      spin?: number;
      drag?: number;
    } = {},
  ) {
    const out: Particle[] = [];
    for (let i = 0; i < this.count(n); i++) {
      const p = this.size(this.spawn(name, x, y, z), rand(...(o.size ?? [0.26, 0.4])));
      if (o.hex !== undefined) this.color(p, o.hex);
      const a = (o.yaw ?? 0) + rand(-1, 1) * (o.spread ?? Math.PI);
      const v = (o.speed ?? 4) * rand(0.45, 1);
      p.vx = Math.cos(a) * v;
      p.vz = Math.sin(a) * v;
      p.vy = rand(...(o.up ?? [1.5, 4]));
      p.gravity = o.gravity ?? -9;
      p.drag = o.drag ?? 1.2;
      p.spin = rand(-1, 1) * (o.spin ?? 8);
      p.life = rand(...(o.life ?? [0.6, 1.1]));
      p.add = !!o.add;
      p.bounce = o.bounce ?? 0;
      p.delay = o.delay ? rand(0, o.delay) : 0;
      if (o.home) {
        p.home = o.home;
        p.homeAt = rand(0.4, 0.6);
        p.life = 1.4;
        p.fade = 0.95;
      }
      out.push(p);
    }
    return out;
  }
  /** Sprites raining down over a circle. */
  private rain(name: string, at: Vec, n: number, radius: number, o: { hex?: number; size?: [number, number] } = {}) {
    for (let i = 0; i < this.count(n); i++) {
      const p = this.size(
        this.spawn(name, at.x + rand(-radius, radius), rand(5, 8), at.y + rand(-radius, radius)),
        rand(...(o.size ?? [0.3, 0.46])),
      );
      if (o.hex !== undefined) this.color(p, o.hex);
      p.delay = rand(0, 0.9);
      p.vy = -3;
      p.gravity = -14;
      p.bounce = 0.45;
      p.spin = rand(-5, 5);
      p.life = 2;
      p.fade = 0.8;
    }
  }
  /** A spiral rising around a point. */
  private swirl(name: string, at: Vec, n: number, o: { hex?: number; add?: boolean; radius?: number; size?: number; rise?: number } = {}) {
    for (let i = 0; i < this.count(n); i++) {
      const p = this.size(this.spawn(name, at.x, rand(0.1, 0.6), at.y), o.size ?? 0.26);
      if (o.hex !== undefined) this.color(p, o.hex);
      p.add = !!o.add;
      p.swirl = true;
      p.cx = at.x;
      p.cz = at.y;
      p.rad = (o.radius ?? 1) * rand(0.6, 1.2);
      p.radV = -0.4;
      p.ang = (i / n) * Math.PI * 2;
      p.angV = rand(7, 11);
      p.vy = (o.rise ?? 2.4) * rand(0.7, 1.2);
      p.life = rand(0.6, 0.95);
      p.delay = rand(0, 0.25);
    }
  }
  /** A ground shockwave: rings and a flash disc. */
  private shock(at: Vec, hex: number, r: number, dur = 0.5) {
    this.fx.ring(at, 0.3, r, hex, dur, this.now, 0.85);
    this.fx.ring(at, 0.2, r * 0.7, WHITE, dur * 0.8, this.now, 0.6);
    this.fx.disc(at, 0.3, r * 0.8, hex, dur * 0.8, this.now, 0.3);
  }
  /** Rockets that burst into a fighter's icons. */
  private fireworks(s: Star, n: number) {
    for (let v = 0; v < n; v++)
      this.after(v * 0.3, () => {
        const rocket = this.size(this.spawn("dot", s.x, 1.2, s.z), 0.35);
        this.color(rocket, s.theme.color);
        rocket.add = true;
        rocket.vx = rand(-2.5, 2.5);
        rocket.vz = rand(-2, 2);
        rocket.vy = rand(8.5, 10.5);
        rocket.gravity = -10;
        rocket.life = rand(0.45, 0.6);
        rocket.fade = 1;
        rocket.die = this.dieKind(this.icon(s, v % 2 ? 1 : 0), 14, s.theme.color);
      });
  }
  private nearest(match: Match, at: Vec, not: string) {
    let best: Player | null = null,
      d = 1.4;
    for (const p of match.players) {
      if (p.id === not || !p.alive) continue;
      const e = Math.hypot(p.pos.x - at.x, p.pos.y - at.y);
      if (e < d) {
        d = e;
        best = p;
      }
    }
    return best;
  }

  // ------------------------------------------------------------------- beats

  /** The match start (full) or a respawn: the landing. */
  private entrance(s: Star, full: boolean) {
    const th = s.theme,
      at = this.at(s);
    const [, landSeconds] = MOTION[s.fighter].respawn;
    // The landing clip falls for its first half or so.
    const land = landSeconds * 0.5;
    if (full) this.actors.get(s.id)?.trigger("respawn", this.now);
    this.after(land, () => {
      this.voice(s, "thud", 80);
      this.shock(at, th.color, full ? 2.6 : 1.8, 0.55);
      this.spray("dot", s.x, 0.15, s.z, 14, {
        speed: 5,
        up: [0.3, 1.2],
        gravity: -2,
        hex: 0xd9c9a8,
        size: [0.3, 0.5],
        life: [0.35, 0.6],
        drag: 4,
      });
      this.spray(this.icon(s, 0), s.x, 1.2, s.z, full ? 10 : 5, { speed: 4.5, up: [2, 5] });
      this.squashStar(s, -0.2);
      if (full) this.shake(200, 0.006);
      this.entranceFlourish(s, at, full);
    });
    if (!full) {
      this.after(land, () => this.stamp(this.word(s, "title"), at, SELF_Y, 0.45, th.color, 1));
      return;
    }
    if (this.isFocus(s.id)) {
      this.darken(s.id, 0.55, 2.2);
      this.after(land + 0.12, () => {
        this.slam(this.word(s, "title"), 0, 0.64, 0.2, 1.6, WHITE);
        const flare = this.size(this.spawn("flare", 0, 0.64, 0), 0.07);
        flare.screen = true;
        flare.add = true;
        flare.w = 2.6;
        flare.life = 0.5;
        flare.grow = 1.4;
        this.voice(s, "boom", 200);
      });
      this.after(land + 0.4, () => {
        const sub = this.slam(this.word(s, "tag"), 0, 0.47, 0.085, 1.3, th.color, false);
        sub.pop = 0;
        sub.slide = 0.25;
        sub.sx = 1.4;
      });
    } else {
      this.after(land + 0.1, () => this.stamp(this.word(s, "title"), at, BANNER_Y, 0.62, WHITE, 1.5));
      this.after(land + 0.35, () => this.stamp(this.word(s, "tag"), at, TARGET_Y, 0.34, th.color, 1.3));
    }
  }

  /** Each fighter's own touch on the landing. */
  private entranceFlourish(s: Star, at: Vec, full: boolean) {
    const th = s.theme;
    switch (s.fighter) {
      case "brandon":
        // Waves all round, then a "HELLO" sticker slaps on.
        this.swirl(this.icon(s, 1), at, 8, { radius: 1.2, size: 0.34 });
        this.after(0.2, () => this.stamp(this.word(s, "attack"), at, SELF_Y, 0.5, th.accent, 1, -0.12));
        break;
      case "daniel":
        // Honk, exhaust and a skid ring.
        this.voice(s, "honk", 300);
        this.spray(this.icon(s, 2), s.x - 0.8, 0.4, s.z, 8, { yaw: Math.PI, spread: 0.5, speed: 3, up: [0.2, 1], gravity: 0.5 });
        this.fx.ring(at, 1.2, 1.4, 0x3a3f47, 0.8, this.now, 0.5, 0.05);
        if (full) this.stamp(this.word(s, "beep"), at, SELF_Y, 0.42, th.accent, 1);
        break;
      case "rich":
        // Flashbulbs going off around him.
        for (let i = 0; i < 6; i++)
          this.after(i * 0.12, () => {
            const a = rand(0, Math.PI * 2);
            const b = this.size(this.spawn("star", s.x + Math.cos(a) * 1.6, rand(0.8, 2.2), s.z + Math.sin(a) * 1.2), 0.9);
            b.add = true;
            b.life = 0.18;
            b.grow = 0.3;
            this.voice(s, "shutter", 60, rand(0.9, 1.2));
          });
        break;
      case "samuel":
        this.rain(this.icon(s, 1), at, 12, 1.6);
        this.rain(this.icon(s, 0), at, 6, 1.4);
        break;
      case "josh":
        // Bass drops: three pulses, and the count-in.
        for (let i = 0; i < 3; i++)
          this.after(i * 0.18, () => {
            this.fx.ring(at, 0.4, 2.4 + i, th.color, 0.4, this.now, 0.7);
            this.voice(s, "thud", 60, 0.8 + i * 0.1);
          });
        if (full) this.stamp(this.word(s, "count"), at, SELF_Y, 0.42, th.accent, 1.4);
        break;
      case "elijah":
        // Pixels assemble him out of thin air.
        this.spray("px", s.x, 1.1, s.z, 24, { speed: 6, up: [-1, 3], gravity: 0, hex: th.color, size: [0.1, 0.18], home: s.id, add: true });
        this.voice(s, "glitch", 100);
        if (full) this.stamp(this.word(s, "deploy"), at, SELF_Y, 0.4, th.color, 1.2);
        break;
      case "ethan":
        this.swirl(this.icon(s, 2), at, 10, { radius: 1.3, size: 0.3 });
        this.voice(s, "strum", 150);
        break;
      case "david": {
        // A spotlight from above and a held note.
        const beam = this.size(this.spawn("flare", s.x, 3, s.z), 0.6);
        beam.w = 6;
        beam.roll = Math.PI / 2;
        beam.add = true;
        this.color(beam, th.accent);
        beam.life = 1;
        this.spray(this.icon(s, 1), s.x, 1.8, s.z, 6, { speed: 1.5, up: [1, 2], gravity: 0.5, life: [1, 1.4] });
        this.voice(s, "hum", 200);
        break;
      }
      case "dylan":
        // A splash landing: water ring, droplets, a fish jumps.
        this.fx.ring(at, 0.4, 2.2, 0x8bd3ff, 0.6, this.now, 0.8);
        this.spray(this.icon(s, 2), s.x, 0.4, s.z, 12, { speed: 3, up: [3, 5.5], gravity: -12, size: [0.18, 0.28] });
        this.spray(this.icon(s, 1), s.x, 0.4, s.z, 1, { speed: 2.5, up: [6, 7], gravity: -12, size: [0.5, 0.5], spin: 12 });
        this.voice(s, "splash", 150);
        break;
      case "isaac":
        this.after(0.15, () => this.stamp(this.word(s, "checked"), at, SELF_Y, 0.42, 0x4be08a, 1.2, -0.1));
        this.spray(this.icon(s, 2), s.x, 1.4, s.z, 8, { speed: 3, up: [2, 3.5], gravity: -3, life: [0.9, 1.3], drag: 2 });
        break;
      case "tovya":
        // Hero landing cracks the ground and lets off steam.
        this.fx.ring(at, 0.2, 3, 0x5b4a2e, 0.7, this.now, 0.6, 0.05);
        this.spray(this.icon(s, 2), s.x, 0.6, s.z, 8, { speed: 2, up: [1.5, 3], gravity: 1, life: [0.9, 1.4] });
        this.voice(s, "boom", 200);
        break;
      case "rosalie":
        this.rain(this.icon(s, 1), at, 14, 1.8, { size: [0.22, 0.32] });
        this.spray(this.icon(s, 0), s.x + 0.9, 0.5, s.z, 1, { speed: 0.5, up: [4, 4.5], gravity: -10, size: [0.6, 0.6], spin: 2 });
        break;
      case "joelle":
        this.spray(this.icon(s, 3), s.x, 0.4, s.z, 8, { speed: 3.5, up: [0.3, 1], gravity: 0 });
        this.swirl(this.icon(s, 2), at, 6, { radius: 1.1 });
        this.voice(s, "whistle", 200);
        break;
      case "susannah":
        // Notifications pile in.
        for (let i = 0; i < 5; i++)
          this.after(i * 0.1, () => {
            this.spray(this.icon(s, i % 2 ? 1 : 2), s.x + rand(-0.6, 0.6), 2.2, s.z, 1, { speed: 0.6, up: [1.5, 2], gravity: 0, life: [1, 1.2] });
            this.voice(s, "ding", 50, 1 + i * 0.08);
          });
        break;
      case "joyce":
        // Delivered by paper planes.
        this.spray(this.icon(s, 0), s.x, 2.6, s.z, 6, { speed: 3, up: [-0.5, 0.5], gravity: 0, home: s.id });
        this.voice(s, "flutter", 120);
        break;
      case "miriam":
        // Doves settle around her.
        this.spray(this.icon(s, 0), s.x, 3, s.z, 5, { speed: 3, up: [-0.4, 0.4], gravity: 0, home: s.id, size: [0.4, 0.5] });
        this.spray("star", s.x, 1.6, s.z, 10, { speed: 1.5, up: [-0.5, 0.5], gravity: -0.5, add: true, size: [0.12, 0.2] });
        this.voice(s, "choir", 300);
        break;
      case "jemuel": {
        // A pillar of morning light.
        const sun = this.size(this.spawn("rays", s.x, 2.2, s.z), 3.2);
        this.color(sun, th.accent);
        sun.add = true;
        sun.spin = 1.2;
        sun.life = 1.1;
        sun.grow = 1.3;
        this.voice(s, "choir", 300);
        break;
      }
      case "russell":
        this.rain(this.icon(s, 0), at, 12, 1.4, { size: [0.24, 0.34] });
        this.voice(s, "coin", 100);
        break;
    }
  }

  /** The attack leaves: a themed release on the frame it fires. */
  release(id: string, from: Vec, dir: Vec, now: number) {
    this.now = now;
    const s = this.stars.get(id);
    if (!s) return;
    const th = s.theme,
      yaw = Math.atan2(dir.y, dir.x),
      hx = from.x + dir.x * 0.6,
      hz = from.y + dir.y * 0.6;
    this.voice(s, th.voice.attack, 70, rand(0.94, 1.08));
    for (let i = 0; i < this.count(4); i++) {
      const sp = this.sparkle(hx, 1, hz, th.color, 0.2);
      const a = yaw + rand(-0.6, 0.6);
      sp.vx = Math.cos(a) * 4;
      sp.vz = Math.sin(a) * 4;
    }
    if (now - s.wordAt > 2.2) {
      s.wordAt = now;
      this.stamp(this.word(s, "attack"), from, SELF_Y, 0.42, th.color, 0.8, rand(-0.1, 0.1));
    }
    this.squashStar(s, 0.07);
    s.idle = 0;
    switch (s.fighter) {
      case "brandon":
        this.spray(this.icon(s, 1), hx, 1.6, hz, 1, { speed: 0.3, up: [1, 1.2], gravity: 0, life: [0.5, 0.6] });
        break;
      case "daniel":
        this.spray(this.icon(s, 0), hx, 1, hz, 3, { yaw, spread: 0.5, speed: 3, size: [0.18, 0.24], life: [0.3, 0.45] });
        break;
      case "rich":
        // The lens glints while he focuses.
        this.quadGlint(hx, 1.75, hz, 0.8, WHITE);
        break;
      case "samuel":
        this.spray("dot", hx, 1.2, hz, 6, { yaw, spread: 0.6, speed: 3, hex: 0xc48a4a, size: [0.07, 0.12], gravity: -9, bounce: 0.3 });
        break;
      case "josh":
        // Sound rings ride out along the cone.
        for (let i = 0; i < 4; i++)
          this.after(i * 0.05, () =>
            this.fx.ring({ x: from.x + dir.x * (1 + i * 1.4), y: from.y + dir.y * (1 + i * 1.4) }, 0.2, 0.6 + i * 0.5, th.color, 0.25, this.now, 0.8, 0.9),
          );
        this.spray(this.icon(s, 1), hx, 1.4, hz, 3, { yaw, spread: 0.35, speed: 5, gravity: 0, life: [0.5, 0.7] });
        break;
      case "elijah":
        this.spray("px", hx, 1, hz, 8, { yaw, spread: 0.7, speed: 3, gravity: 0, hex: th.color, size: [0.07, 0.12], add: true, life: [0.2, 0.35] });
        break;
      case "ethan":
        this.fx.ring({ x: hx, y: hz }, 0.2, 1.1, th.color, 0.3, this.now, 0.8, 0.9);
        this.spray(this.icon(s, 1), hx, 1.4, hz, 2, { yaw, spread: 0.4, speed: 2.5, gravity: 0.5, life: [0.6, 0.8] });
        break;
      case "david":
        this.spray(this.icon(s, 1), hx, 1.7, hz, 2, { yaw, spread: 0.5, speed: 2, gravity: 0.6, life: [0.6, 0.9] });
        break;
      case "dylan":
        this.voice(s, "reel", 80, 1.3);
        break;
      case "isaac":
        for (let i = 0; i < 3; i++)
          this.after(i * 0.09, () =>
            this.spray(this.icon(s, 0), hx, 1, hz, 1, { yaw: yaw + Math.PI, spread: 0.8, speed: 2, size: [0.16, 0.2], life: [0.3, 0.4] }),
          );
        break;
      case "tovya":
        // Steam and splashes along the ladle's arc.
        this.spray(this.icon(s, 2), hx, 1, hz, 4, { yaw, spread: 1, speed: 2.5, gravity: 1, life: [0.4, 0.7] });
        this.spray("dot", hx, 1, hz, 8, { yaw, spread: 1, speed: 4, hex: 0xffb35c, size: [0.08, 0.14], gravity: -10 });
        break;
      case "rosalie":
        this.spray(this.icon(s, 1), hx, 1.2, hz, 6, { yaw, spread: 0.7, speed: 4, gravity: -1, size: [0.18, 0.26] });
        break;
      case "joelle":
        this.fx.ring({ x: hx, y: hz }, 0.5, 0.9, th.color, 0.25, this.now, 0.8, 0.9);
        break;
      case "susannah":
        this.spray(this.icon(s, 2), s.x, 2.2, s.z, 1, { speed: 0.3, up: [1, 1.2], gravity: 0, life: [0.6, 0.7] });
        break;
      case "joyce":
        this.spray(this.icon(s, 1), hx, 1.3, hz, 3, { yaw, spread: 0.5, speed: 2, gravity: 0.5, size: [0.16, 0.22] });
        break;
      case "miriam":
        this.spray("star", hx, 1.6, hz, 6, { yaw, spread: 0.8, speed: 2, gravity: -0.5, add: true, size: [0.12, 0.2] });
        break;
      case "jemuel": {
        // Morning light: a ring of rays around him.
        const sun = this.size(this.spawn("rays", s.x, 1.1, s.z), 2.6);
        this.color(sun, th.accent);
        sun.add = true;
        sun.spin = 4;
        sun.life = 0.35;
        sun.grow = 1.6;
        this.fx.ring(this.at(s), 0.5, FIGHTERS.jemuel.range + 0.4, th.accent, 0.3, this.now, 0.85);
        break;
      }
      case "russell":
        this.spray(this.icon(s, 0), hx, 1.6, hz, 1, { speed: 0.4, up: [3.5, 4], gravity: -10, spin: 18, size: [0.26, 0.3] });
        break;
    }
  }

  private quadGlint(x: number, y: number, z: number, h: number, hex: number) {
    const g = this.size(this.spawn("star", x, y, z), h);
    this.color(g, hex);
    g.add = true;
    g.life = 0.25;
    g.grow = 0.2;
    g.spin = 6;
  }

  /** One of the fighter's hits landed. */
  private landed(s: Star, at: Vec, value: number, match: Match) {
    const th = s.theme,
      big = value >= 1200;
    this.voice(s, th.voice.hit, 60, rand(0.95, 1.1));
    this.spray(this.icon(s, 2), at.x, 1.1, at.y, big ? 7 : 4, { speed: 4.5, size: [0.22, 0.34], life: [0.45, 0.8] });
    this.fx.ring(at, 0.2, big ? 1.4 : 0.9, th.color, 0.3, this.now, 0.9, 0.85);
    s.combo++;
    if (this.now - s.hitWordAt > 0.45) {
      s.hitWordAt = this.now;
      const key = s.fighter === "rich" && value >= 1500 ? "far" : "hit";
      this.stamp(this.word(s, key), at, TARGET_Y, big ? 0.6 : 0.48, th.color, 0.85, rand(-0.18, 0.18));
    }
    if (value >= 300) this.freeze(big ? 70 : 40, s.id);
    if (big) {
      this.zoom(0.05, 0.4, s.id);
      this.shake(180, 0.006);
    }
    const target = this.nearest(match, at, s.id);
    switch (s.fighter) {
      case "brandon":
        // The nametag sticks; the reveal tag rides above them while it lasts.
        this.stamp("i" + th.icons[0], at, 1.6, 0.42, WHITE, 0.6, -0.2);
        break;
      case "daniel":
        if (s.combo % 5 === 0) this.stamp(this.word(s, "beep"), at, BANNER_Y, 0.42, th.accent, 0.8);
        break;
      case "rich":
        this.quadGlint(at.x, 1.2, at.y, 1.6, WHITE);
        break;
      case "elijah":
        this.spray(this.icon(s, 0), at.x, 0.4, at.y, 3, { speed: 2.5, up: [0.5, 1.5], gravity: -6, bounce: 0.3, size: [0.22, 0.3] });
        this.spray("px", at.x, 1, at.y, 10, { speed: 4, gravity: 0, hex: th.color, size: [0.07, 0.13], add: true, life: [0.2, 0.4] });
        break;
      case "ethan":
        this.spray(this.icon(s, 2), at.x, 1.6, at.y, 5, { speed: 1.5, up: [1.5, 2.5], gravity: 0.6, life: [0.8, 1.1] });
        break;
      case "dylan":
        // Hooked: a splash, and a fish jumps out.
        this.spray(this.icon(s, 2), at.x, 0.6, at.y, 6, { speed: 2, up: [2.5, 4], gravity: -12, size: [0.16, 0.24] });
        if (s.combo % 3 === 0)
          this.spray(this.icon(s, 1), at.x, 0.6, at.y, 1, { speed: 2, up: [5, 6], gravity: -12, size: [0.4, 0.4], spin: 14 });
        break;
      case "isaac":
        this.spray(this.icon(s, 2), at.x, 1.3, at.y, 3, { speed: 2.5, up: [1.5, 3], gravity: -3, drag: 2, life: [0.8, 1.1] });
        break;
      case "tovya":
        this.spray("star", at.x, 2.1, at.y, 4, { speed: 1.5, up: [0.5, 1], gravity: 0, hex: 0xffe494, add: true, size: [0.2, 0.28] });
        break;
      case "susannah":
        this.spray(this.icon(s, 1), at.x, 1.8, at.y, 3, { speed: 1, up: [1.5, 2.2], gravity: 0.4, life: [0.8, 1.1] });
        break;
      case "miriam":
        if (target) this.fx.ring(target.pos, 0.9, 0.5, 0xd9ceff, 0.5, this.now, 0.7, 0.1);
        break;
      case "russell":
        this.spray(this.icon(s, 1), at.x, 1.4, at.y, 3, { speed: 3, up: [2, 3.5], gravity: -4, drag: 2.5, spin: 4 });
        break;
      default:
        break;
    }
  }

  /**
   * The fighter took a hit: their pieces scatter and fly back. The word is
   * kept for big hits and the viewer's own fighter, so a brawl stays legible.
   */
  private hurt(s: Star, lost: number) {
    const th = s.theme,
      at = this.at(s);
    this.squashStar(s, -0.15);
    this.wash(s.id, RED, 0.2, 0.25);
    if (this.now - s.hurtAt < 0.7) return;
    s.hurtAt = this.now;
    if (lost >= 700 || this.isMine(s.id))
      this.stamp(this.word(s, "hurt"), at, SELF_Y, 0.42, RED, 0.75, rand(-0.16, 0.16));
    this.spray(this.icon(s, 0), s.x, 1.2, s.z, 4, { speed: 4.5, home: s.id, size: [0.22, 0.3], gravity: -6, drag: 3 });
    switch (s.fighter) {
      case "elijah":
        this.spray("px", s.x, 1.2, s.z, 10, { speed: 3, gravity: 0, hex: RED, size: [0.08, 0.14], add: true, life: [0.2, 0.35] });
        break;
      case "samuel":
        this.spray("dot", s.x, 1.2, s.z, 8, { speed: 3, hex: 0xc48a4a, size: [0.07, 0.12], bounce: 0.3 });
        break;
      case "russell":
        this.spray(this.icon(s, 0), s.x, 1.2, s.z, 3, { speed: 3.5, up: [2, 4], gravity: -10, bounce: 0.4, size: [0.2, 0.26] });
        break;
      case "tovya":
        this.spray("dot", s.x, 1.1, s.z, 10, { speed: 3, hex: th.accent, size: [0.08, 0.14] });
        break;
    }
  }

  /** The Super was pressed: the windup, before the authority answers. */
  windup(id: string, now: number) {
    this.now = now;
    const s = this.stars.get(id);
    if (!s || now - s.windupAt < 0.6) return;
    s.windupAt = now;
    const th = s.theme,
      at = this.at(s);
    this.voice(s, "rise", 200);
    this.swirl("star", at, 12, { hex: th.color, add: true, radius: 1.2, size: 0.22 });
    this.fx.ring(at, 2.4, 0.6, th.color, 0.45, now, 0.8, 0.1);
    this.squashStar(s, 0.12);
    switch (s.fighter) {
      case "daniel":
        this.voice(s, "honk", 300);
        // Headlights flash twice.
        for (let i = 0; i < 2; i++)
          this.after(i * 0.15, () => {
            for (const side of [-0.3, 0.3]) this.quadGlint(s.x + side, 0.9, s.z + 0.4, 0.9, 0xfff3b0);
          });
        break;
      case "rich":
      case "david":
        this.speedLines(s.id, 0.35);
        break;
      case "tovya":
        this.spray(this.icon(s, 2), s.x, 0.3, s.z, 8, { speed: 2.5, up: [0.5, 1.5], gravity: 1 });
        break;
      case "elijah":
        this.stamp("i" + th.icons[3], at, SELF_Y, 0.5, WHITE, 0.6);
        this.voice(s, "rewind", 300);
        break;
    }
    if (th.instant) this.payoff(s, at, 1);
  }

  /** The Super resolved at `at`: the big themed moment. */
  private payoff(s: Star, at: Vec, scale: number) {
    if (this.now - s.payoffAt < 1.2) return;
    s.payoffAt = this.now;
    const th = s.theme;
    this.voice(s, th.voice.super, 150);
    this.voice(s, "boom", 200);
    this.banner(s, "super", th.color, 1.1);
    this.shock(at, th.color, 3.2 * scale, 0.6);
    this.after(0.15, () => this.fx.ring(at, 0.4, 2.4 * scale, th.accent, 0.5, this.now, 0.6));
    this.spray(this.icon(s, 0), at.x, 1, at.y, 12, { speed: 5, up: [3, 6], size: [0.3, 0.46] });
    this.shake(260, 0.008);
    this.zoom(0.08, 0.6, s.id);
    this.freeze(80, s.id);
    this.squashStar(s, 0.2);
    switch (s.fighter) {
      case "brandon":
        // Balloons and waves for everyone in the circle.
        this.rain(this.icon(s, 3), at, 14, 2.6);
        this.swirl(this.icon(s, 1), at, 10, { radius: 2.4, size: 0.34 });
        break;
      case "daniel":
        this.stamp(this.word(s, "beep"), at, SELF_Y, 0.5, th.accent, 1);
        this.spray(this.icon(s, 2), at.x, 0.5, at.y, 10, { speed: 3, up: [0.2, 1], gravity: 0.6 });
        break;
      case "rich":
        // The group photo flash, blinding for his own camera.
        this.impactFrame(s.id, 0.06);
        this.wash(s.id, WHITE, 0.55, 0.35);
        for (let i = 0; i < 8; i++)
          this.after(i * 0.05, () =>
            this.quadGlint(at.x + rand(-3, 3), rand(0.6, 2), at.y + rand(-2, 2), 1.4, WHITE),
          );
        this.rain(this.icon(s, 1), at, 8, 3);
        break;
      case "samuel":
        this.spray(this.icon(s, 1), at.x, 1.2, at.y, 18, { speed: 4, up: [3, 6], bounce: 0.5 });
        this.rain(this.icon(s, 3), at, 6, 2);
        break;
      case "josh":
        for (let i = 0; i < 5; i++)
          this.after(i * 0.07, () => this.fx.ring(at, 0.5, 2 + i * 1.6, i % 2 ? WHITE : th.color, 0.4, this.now, 0.7));
        this.speedLines(s.id, 0.5);
        this.spray(this.icon(s, 2), at.x, 1.4, at.y, 8, { speed: 7, up: [0.5, 2], gravity: 0 });
        break;
      case "elijah":
        this.spray("px", at.x, 1, at.y, 40, { speed: 7, up: [-1, 4], gravity: -2, hex: th.color, size: [0.1, 0.2], add: true });
        this.impactFrame(s.id);
        break;
      case "ethan":
        this.spray(this.icon(s, 2), at.x, 1.4, at.y, 18, { speed: 6, up: [2, 5] });
        break;
      case "david": {
        // Giant side-eyes sweep across.
        const eyes = this.size(this.spawn(this.icon(s, 2), at.x - 2, 2.6, at.y), 1.4);
        eyes.vx = 4;
        eyes.life = 1;
        eyes.pop = 0.15;
        eyes.pop0 = 0.2;
        break;
      }
      case "dylan":
        this.fx.ring(at, 3.2, 0.5, 0x8bd3ff, 0.5, this.now, 0.8);
        this.spray(this.icon(s, 1), at.x, 0.5, at.y, 6, { speed: 3, up: [4, 6], gravity: -12, spin: 14, bounce: 0.4 });
        this.spray(this.icon(s, 2), at.x, 0.5, at.y, 14, { speed: 4, up: [3, 5], gravity: -12, size: [0.16, 0.24] });
        break;
      case "isaac":
        for (let i = -2; i <= 2; i++)
          this.after(0.1 + (i + 2) * 0.08, () =>
            this.stamp("i" + th.icons[3], { x: at.x + i * 0.8, y: at.y }, 1.8, 0.4, WHITE, 0.9),
          );
        break;
      case "tovya":
        // The slam cracks the ground; bowls bounce out.
        this.fx.ring(at, 0.2, 3.6, 0x5b4a2e, 0.9, this.now, 0.7, 0.05);
        this.spray(this.icon(s, 1), at.x, 0.4, at.y, 8, { speed: 4.5, up: [3, 5], bounce: 0.5, spin: 10 });
        this.impactFrame(s.id);
        this.shake(380, 0.012);
        break;
      case "rosalie":
        this.spray(this.icon(s, 1), at.x, 1, at.y, 20, { speed: 4, up: [2, 4.5], gravity: -3, size: [0.2, 0.3] });
        this.spray(this.icon(s, 2), at.x, 1.8, at.y, 1, { speed: 0.2, up: [1, 1.2], gravity: 0, size: [0.6, 0.6], life: [1, 1.1] });
        break;
      case "joelle":
        this.swirl(this.icon(s, 1), at, 8, { radius: 1, size: 0.34 });
        this.speedLines(s.id, 0.3);
        break;
      case "susannah":
        this.rain(this.icon(s, 3), at, 14, 2.2);
        this.spray(this.icon(s, 1), at.x, 1, at.y, 10, { speed: 4, up: [2, 4] });
        break;
      case "joyce":
        // Gifts and trees land on every teammate.
        this.rain(this.icon(s, 2), at, 6, 1.6);
        this.rain(this.icon(s, 3), at, 6, 1.6);
        this.wash(s.id, th.color, 0.22, 1);
        break;
      case "miriam":
        // A slow calm: lilac rings that contract, doves circling.
        for (let i = 0; i < 3; i++)
          this.after(i * 0.2, () => this.fx.ring(at, 3.8, 0.6, 0xd9ceff, 0.8, this.now, 0.6));
        this.swirl(this.icon(s, 0), at, 6, { radius: 2.4, size: 0.42, rise: 1 });
        this.wash(s.id, th.color, 0.2, 1.2);
        break;
      case "jemuel": {
        const dome = this.size(this.spawn("ringS", at.x, 1.2, at.y), 6);
        this.color(dome, th.accent);
        dome.add = true;
        dome.life = 1.1;
        dome.grow = 1.25;
        dome.pop = 0.2;
        dome.pop0 = 0.2;
        this.swirl("star", at, 20, { hex: th.accent, add: true, radius: 3, size: 0.22 });
        break;
      }
      case "russell":
        // Cuts: bills shredded, the chart crashes.
        this.spray(this.icon(s, 1), at.x, 1.4, at.y, 14, { speed: 6, up: [1.5, 4], spin: 14 });
        this.spray(this.icon(s, 3), at.x, 2.6, at.y, 1, { speed: 0.2, up: [0.5, 0.6], gravity: -1, size: [0.7, 0.7], life: [1.1, 1.2] });
        break;
    }
  }

  /** Knocked out: the soul leaves, the pieces scatter. */
  private defeat(s: Star) {
    const th = s.theme,
      at = this.at(s);
    this.voice(s, "sad", 400);
    this.voice(s, "thud", 100, 0.8);
    const soul = this.size(this.spawn(this.icon(s, 0), s.x, 1.6, s.z), 0.62);
    soul.vy = 1.1;
    soul.sway = 1.2;
    soul.life = 2.4;
    soul.fade = 0.6;
    soul.delay = 0.25;
    const halo = this.size(this.spawn("dot", s.x, 1.6, s.z), 1.6);
    this.color(halo, th.color);
    halo.add = true;
    halo.vy = 1.1;
    halo.life = 2.4;
    halo.delay = 0.25;
    this.spray(this.icon(s, 1), s.x, 1.2, s.z, 8, { speed: 3.5, up: [2, 4], bounce: 0.35, size: [0.22, 0.32] });
    this.fx.ring(at, 0.4, 2, WHITE, 0.5, this.now, 0.6);
    if (this.isMine(s.id) && !this.calm) {
      Object.assign(this.dark, {
        start: this.now,
        in: 0.22,
        end: this.now + 2,
        out: 0.35,
        alpha: 0.45,
        id: s.id,
      });
      this.slam(this.word(s, "down"), 0, 0.3, 0.13, 2, RED);
    } else this.stamp(this.word(s, "down"), at, SELF_Y, 0.6, RED, 1.8);
    switch (s.fighter) {
      case "daniel":
      case "joelle":
        this.spray(this.icon(s, 3), s.x, 0.6, s.z, 6, { speed: 1.5, up: [1, 2], gravity: 1, life: [1, 1.5] });
        break;
      case "rich":
        this.quadGlint(s.x, 1.4, s.z, 3, WHITE);
        this.wash(s.id, WHITE, 0.5, 0.3);
        break;
      case "elijah":
        this.spray("px", s.x, 1.2, s.z, 36, { speed: 1.5, up: [1, 3], gravity: 1.2, hex: th.color, size: [0.1, 0.18], add: true, life: [0.9, 1.4] });
        break;
      case "samuel":
      case "tovya":
        this.fx.disc(at, 0.2, 1.4, th.accent, 1.6, this.now, 0.4);
        break;
      case "rosalie":
      case "miriam":
      case "joyce":
        this.rain(this.icon(s, 1), at, 8, 1.2, { size: [0.2, 0.28] });
        break;
      case "jemuel":
        this.fx.disc(at, 2, 0.2, th.accent, 1, this.now, 0.4);
        break;
      case "russell":
        this.spray(this.icon(s, 0), s.x, 1, s.z, 10, { speed: 3, up: [1, 3], bounce: 0.4, size: [0.2, 0.28] });
        break;
    }
  }

  /** A knockout scored, or a goal for their side (`big`). */
  private victory(s: Star, big: boolean) {
    const at = this.at(s);
    this.voice(s, "fanfare", 500);
    this.fireworks(s, big ? 4 : 1);
    this.spray(this.icon(s, 0), s.x, 1.4, s.z, big ? 14 : 6, { speed: 4, up: [2, 5] });
    if (big) this.banner(s, "win", WHITE, 2.4, 0.6, 0.16);
    else this.stamp(this.word(s, "win"), at, TARGET_Y, 0.55, s.theme.color, 1.2);
  }

  // ------------------------------------------------------------ authoritative

  /** First sight of an authoritative effect owned by a roster fighter. */
  effect(e: Effect, match: Match, now: number) {
    this.now = now;
    const s = this.stars.get(e.owner);
    if (!s) return;
    switch (e.kind) {
      case "attack":
        this.release(e.owner, e.pos, e.dir, now);
        return;
      case "hit":
        if (e.value) this.landed(s, e.pos, e.value, match);
        return;
      case "heal": {
        this.spray("star", e.pos.x, 1.4, e.pos.y, 5, { speed: 1, up: [1.5, 2.5], gravity: 0, hex: 0x9dffc8, add: true, size: [0.16, 0.24] });
        if (s.theme.extra?.heal && now - s.hitWordAt > 0.5) {
          s.hitWordAt = now;
          this.stamp(this.word(s, "heal"), e.pos, SELF_Y, 0.42, 0x9dffc8, 0.8);
        }
        return;
      }
      case "beam":
        if (e.value) {
          // Rich's flash fires: the shutter, a muzzle burst.
          this.voice(s, "flash", 60);
          this.quadGlint(e.pos.x + e.dir.x * 0.6, 1.5, e.pos.y + e.dir.y * 0.6, 1.4, WHITE);
          this.stamp(this.word(s, "attack"), e.pos, SELF_Y, 0.42, s.theme.color, 0.6, rand(-0.12, 0.12));
        }
        return;
      case "splash":
        // Samuel's bag bursts: snacks everywhere.
        this.voice(s, "crunch", 60);
        this.spray(this.icon(s, 1), e.pos.x, 0.6, e.pos.y, 8, { speed: 3.5, up: [3, 5], bounce: 0.45, size: [0.2, 0.3] });
        this.spray(this.icon(s, 0), e.pos.x, 0.6, e.pos.y, 3, { speed: 2.5, up: [3, 4.5], bounce: 0.45, size: [0.26, 0.32] });
        return;
      case "split":
        this.voice(s, "ding", 60, 1.2);
        this.stamp(this.word(s, "viral"), e.pos, TARGET_Y, 0.5, s.theme.color, 0.9, rand(-0.15, 0.15));
        this.spray(this.icon(s, 1), e.pos.x, 1.2, e.pos.y, 5, { speed: 3, up: [1.5, 3], gravity: -2 });
        this.spray(this.icon(s, 2), e.pos.x, 1.2, e.pos.y, 3, { speed: 3, up: [1.5, 3], gravity: -2 });
        return;
      case "harmony":
        this.stamp(this.word(s, "harmony"), e.pos, BANNER_Y, 0.48, s.theme.accent, 0.8);
        this.spray(this.icon(s, 1), e.pos.x, 1.6, e.pos.y, 4, { speed: 1.5, up: [1.5, 2.5], gravity: 0.4 });
        return;
      case "panda":
        this.spray(this.icon(s, 0), e.pos.x, 1.1, e.pos.y, 1, { speed: 0.4, up: [1, 1.2], gravity: 0, size: [0.3, 0.3], life: [0.4, 0.5] });
        return;
      case "cone":
      case "lob":
        return;
      // Super windups that show a tell first.
      case "marker":
      case "leap":
        this.windup(e.owner, now);
        return;
      case "photo":
      case "gaze":
      case "van":
        if (!e.value) this.windup(e.owner, now);
        else this.payoff(s, e.kind === "van" ? this.at(s) : { x: e.pos.x + e.dir.x * 4, y: e.pos.y + e.dir.y * 4 }, 1);
        return;
      // Supers resolving.
      case "sound":
        this.payoff(s, { x: e.pos.x + e.dir.x * 4, y: e.pos.y + e.dir.y * 4 }, 1);
        return;
      case "burst":
      case "glitch":
      case "aura":
      case "swap":
        this.payoff(s, e.pos, e.kind === "burst" ? Math.max(0.7, (e.value ?? 3) / 3.5) : 1);
        return;
    }
  }

  /** A locally predicted cue for the local fighter (standard §4.1). */
  cue(kind: string, id: string, from: Vec, dir: Vec, now: number) {
    if (kind === "super" || kind === "gaze") this.windup(id, now);
    else if (kind !== "release" && kind !== "item_sweep") this.release(id, from, dir, now);
  }

  // -------------------------------------------------------------------- frame

  private star(p: Player): Star {
    let s = this.stars.get(p.id);
    if (!s) {
      const fighter = p.fighter as RosterId;
      s = {
        id: p.id,
        fighter,
        theme: THEMES[fighter],
        x: p.pos.x,
        z: p.pos.y,
        hp: p.hp,
        alive: p.alive,
        kills: p.stats.kills,
        ready: p.charge >= 5000,
        idle: 0,
        trail: 0,
        flourishAt: this.now + rand(3, 6),
        sweatAt: 0,
        squashAt: -1,
        squash: 0,
        windupAt: -9,
        payoffAt: -9,
        wordAt: -9,
        hitWordAt: -9,
        hurtAt: -9,
        combo: 0,
      };
      this.stars.set(p.id, s);
    }
    return s;
  }

  private follow(f: ShowFrame, p: Player) {
    const a = f.actors.get(p.id);
    if (!a) return;
    const now = f.now,
      first = !this.stars.has(p.id),
      s = this.star(p);
    s.x = a.at.x;
    s.z = a.at.y;
    if (first && p.alive && f.match.phase === "countdown") this.entrance(s, true);
    if (p.alive !== s.alive) {
      s.alive = p.alive;
      if (p.alive) this.entrance(s, false);
      else this.defeat(s);
    } else if (p.alive && s.hp - p.hp >= 80) this.hurt(s, s.hp - p.hp);
    s.hp = p.hp;
    if (p.stats.kills > s.kills && p.alive) this.victory(s, false);
    s.kills = p.stats.kills;
    if (!p.alive || !a.shown) return;

    const th = s.theme,
      moving = a.speed > 1.2;
    s.idle = moving ? 0 : s.idle + f.dt;
    if (moving) {
      s.trail += f.dt;
      if (s.trail > 0.12) {
        s.trail = 0;
        const puff =
          th.trail < 0
            ? this.color(this.size(this.spawn("px", s.x + rand(-0.3, 0.3), rand(0.5, 1.5), s.z + rand(-0.3, 0.3)), 0.12), th.color)
            : this.size(this.spawn("i" + th.icons[th.trail], s.x + rand(-0.2, 0.2), rand(0.4, 1), s.z + rand(-0.2, 0.2)), 0.2);
        puff.vy = rand(0.3, 0.8);
        puff.life = 0.45;
        puff.fade = 0.3;
        puff.grow = 0.6;
        puff.add = th.trail < 0;
      }
    } else if (s.idle > 1.5 && now > s.flourishAt && f.match.phase === "playing") {
      s.flourishAt = now + rand(4.5, 7);
      // A small idle flourish: the signature icon bobs up and spins.
      const bob = this.size(this.spawn(this.icon(s, 0), s.x, 2.4, s.z), 0.38);
      bob.vy = 0.4;
      bob.spin = 4;
      bob.life = 0.9;
      bob.pop = 0.15;
      bob.pop0 = 0.2;
    }

    // Super ready: once, a stamp; then an orbit and a glow while it waits.
    const ready = p.charge >= 5000;
    if (ready && !s.ready) {
      this.stamp("ready", this.at(s), TARGET_Y, 0.42, th.color, 1.1);
      this.swirl("star", this.at(s), 8, { hex: th.color, add: true, radius: 0.9, size: 0.2 });
      if (this.isFocus(p.id)) this.voice(s, "sparkle", 300);
    }
    s.ready = ready;
    if (ready) {
      for (let i = 0; i < 3; i++) {
        const ang = now * 2.6 + (i * Math.PI * 2) / 3;
        this.quad(this.icon(s, i === 0 ? 0 : 1), s.x + Math.cos(ang) * 0.85, 1.2 + 0.15 * Math.sin(now * 3 + i), s.z + Math.sin(ang) * 0.6, 0.26, 0, WHITE, 0.95, false);
      }
      this.quad("dot", s.x, 0.6, s.z, 2.2 + 0.2 * Math.sin(now * 6), 0, th.color, 0.22, true);
    }
    // Windup glow: the gathering light before the Super lands.
    const wind = now - s.windupAt;
    if (wind < 0.7) this.quad("dot", s.x, 1.1, s.z, 1 + wind * 4, 0, th.color, 0.5 * (1 - wind / 0.7), true);
    // Low health: a sweat drop now and then.
    if (p.hp < FIGHTERS[p.fighter].hp / 3 && now > s.sweatAt) {
      s.sweatAt = now + rand(0.9, 1.5);
      const drop = this.size(this.spawn("i" + SWEAT, s.x + 0.35, 2.15, s.z), 0.26);
      drop.vy = -0.4;
      drop.gravity = -2;
      drop.life = 0.7;
    }
  }

  /** Themed trails behind each projectile; Dylan's line stays tied to his rod. */
  private projectiles(f: ShowFrame) {
    const live = new Set<number>();
    for (const q of f.match.projectiles) {
      const s = this.stars.get(q.owner);
      if (!s || q.fighter !== s.fighter) continue;
      live.add(q.id);
      const attack = FIGHTERS[q.fighter].abilities.attack;
      const weave = attack.kind === "shot" && !q.super && !q.shard ? attack.weave : undefined;
      if (s.fighter === "dylan" && !q.super) {
        const a = f.actors.get(q.owner);
        if (a?.shown) {
          const hx = a.at.x + Math.sin(a.yaw) * 0.5,
            hz = a.at.y + Math.cos(a.yaw) * 0.5;
          for (let i = 1; i < 14; i++) {
            const k = i / 14;
            this.quad("dot", hx + (q.pos.x - hx) * k, 1.9 - 1.1 * k - 0.35 * Math.sin(Math.PI * k), hz + (q.pos.y - hz) * k, 0.09, 0, 0xe8f4ff, 0.9, false);
          }
        }
      }
      const due = (this.shotTrail.get(q.id) ?? 0) - f.dt;
      if (due > 0) {
        this.shotTrail.set(q.id, due);
        continue;
      }
      this.shotTrail.set(q.id, 0.06);
      const at = shotPoint(q.pos, q.dir, q.traveled, weave, q.side);
      const y = q.lob ? lobHeight(q.traveled, q.traveled + q.remaining) : PROJECTILE_Y;
      const th = s.theme;
      const bit =
        th.trail < 0 || s.fighter === "elijah"
          ? this.color(this.size(this.spawn("px", at.x, y, at.y), 0.1), th.color)
          : this.size(this.spawn("i" + th.icons[th.trail], at.x, y, at.y), q.shard ? 0.14 : 0.2);
      bit.add = th.trail < 0 || s.fighter === "elijah";
      bit.vx = rand(-0.5, 0.5);
      bit.vz = rand(-0.5, 0.5);
      bit.vy = s.fighter === "samuel" ? -1 : rand(-0.2, 0.6);
      bit.gravity = s.fighter === "samuel" ? -8 : 0;
      bit.spin = rand(-4, 4);
      bit.life = 0.4;
      bit.fade = 0.2;
      bit.grow = 0.5;
    }
    for (const id of this.shotTrail.keys()) if (!live.has(id)) this.shotTrail.delete(id);
  }

  /** Zone Supers place an area: its first sighting is the payoff. */
  private areas(f: ShowFrame) {
    for (const area of f.match.areas) {
      if (this.seenAreas.has(area.id)) continue;
      this.seenAreas.add(area.id);
      const s = this.stars.get(area.owner);
      // Only a fresh placement, not one already standing when the show began.
      const fresh = area.end - f.match.time > AREAS[area.kind].duration - 0.6;
      if (s && fresh) this.payoff(s, area.pos, Math.max(0.6, area.radius / 3));
    }
    if (this.seenAreas.size > 256) this.seenAreas = new Set(f.match.areas.map((a) => a.id));
  }

  /** Brandon's nametags stay stuck above anyone he has revealed. */
  private tags(f: ShowFrame) {
    if (!this.fighters.has("brandon")) return;
    for (const p of f.match.players) {
      if (!p.alive || p.revealUntil <= f.match.time) continue;
      const a = f.actors.get(p.id);
      if (!a?.shown) continue;
      this.quad("i" + THEMES.brandon.icons[0], a.at.x - 0.5, 2.55 + 0.05 * Math.sin(f.now * 4), a.at.y, 0.34, -0.25, WHITE, 0.95, false);
    }
  }

  protected update(f: ShowFrame) {
    if (f.dt > 0) {
      // A rematch can reuse this view: the match clock starts over.
      if (f.match.time < this.matchTime - 1) {
        this.stars.clear();
        this.seenAreas.clear();
        this.clearTimeline();
        this.score = [0, 0];
      }
      this.matchTime = f.match.time;
      this.runTimeline(f.now);
      for (const p of f.match.players) if (isRoster(p.fighter)) this.follow(f, p);
      for (const id of this.stars.keys())
        if (!f.match.players.some((p) => p.id === id)) this.stars.delete(id);
      for (const team of [0, 1] as const) {
        if (f.match.score[team] > this.score[team])
          for (const p of f.match.players) {
            const s = this.stars.get(p.id);
            if (!s || !p.alive) continue;
            if (p.team === team) this.victory(s, true);
            else this.stamp(this.word(s, "hurt"), this.at(s), SELF_Y, 0.45, RED, 1.4);
          }
        this.score[team] = f.match.score[team];
      }
      this.projectiles(f);
      this.areas(f);
    }
    this.tags(f);
  }
}

/** True when a match has a fighter the roster show is for. */
export const hasRoster = (match: Match) => match.players.some((p) => isRoster(p.fighter));
