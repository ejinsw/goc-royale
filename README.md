# GOC Royale

A browser-hosted arena brawler for private groups. React menus, Phaser gameplay, TypeScript simulation, and PeerJS/WebRTC data channels. **No application server, Socket.IO, accounts, or database.** The seven fighters are Brandon Kam, Daniel, Rich, Samuel, Josh, Elijah, and Ethan Ha (Music). Two modes: Showdown FFA (2–8 players) and 3v3 Broomball (exactly six).

## Run it

Requires Node.js 22+ and internet access for PeerJS signaling and STUN discovery.

```sh
npm ci
npm run dev
```

Open the URL printed by Vite (normally http://localhost:5173). Pick a nickname, create a room, and copy the invitation link to another browser. Pick fighters, ready up on every client, and have the host start. The creator must keep their tab open and active. Do not refresh a hosted room: its simulation lives in that tab.

Testing on the same machine: open separate browser tabs, use different nicknames, and join with the code. Multiple tabs are real WebRTC participants, not bots. A desktop host works best. For phones, deploy to HTTPS first: plain HTTP LAN addresses may not provide Web Crypto / WebRTC features consistently.

```sh
npm test          # deterministic gameplay and room tests
npm run typecheck # strict TypeScript check
npm run build     # production static files in dist/
npm run preview   # serve that production build locally
```

## First deployment — static files only

Upload the contents of `dist/` to an HTTPS static host, or connect this repository to Cloudflare Pages with build command `npm run build` and output directory `dist`. A Netlify build configuration is also included. There is no Node process to deploy. Invite links use `?room=ABCDEF` and need no SPA route rewrites. Use the same deployed URL for every participant; a localhost link cannot be used from somebody else's device.

The default network uses the public PeerJS Cloud signaling service and a Google STUN endpoint. Those services help browsers find one another; the browser host runs gameplay. No payment credentials or paid cloud resources are configured by this project. These external services have their own availability and policies. Direct connections can fail on restrictive or carrier networks. Optional TURN settings are documented in `.env.example`; relay service is not included or guaranteed free. The UI reports failed connections instead of pretending a match connected.

### Controls

- Desktop: WASD/arrows move, mouse aims, left click attacks, Space/right click activates Super, Escape opens settings.
- Carrying the Broomball: hold left click to charge; release toward the cursor to pass/shoot. A carrier cannot attack or use a Super.
- Touch: left stick moves. Drag and release right stick to aim/fire; short taps auto-aim at an enemy in range and line of sight. Drag and release the small Super stick when charged. Right-stick drag length controls ball power.
- Portrait mobile gameplay shows a landscape prompt. Settings include independent music/sound and screen shake.
- Eliminated Showdown participants watch the arena; Next Survivor highlights another surviving fighter. Broomball respawns after three seconds.

### Room rules

Only the host changes modes, assigns/shuffles teams, and starts matches. Everyone must be connected and ready. Broomball requires exactly three players per team with no duplicate fighter on the same team. Showdown permits duplicates. Ready states reset on mode/team changes and after returning from results. Run It Back returns everyone to character selection for a rematch.

Guest reconnect identity uses a private random token in sessionStorage, separate from the shareable six-character code. Press Reconnect after a brief lost connection. Guest refresh can rejoin using the code in the current tab, nickname, and saved token. Lobby grace: 30 seconds; match grace: 20 seconds. After grace expires, the fighter is removed from play without a replacement bot. Host departure ends the room; there is no host migration.

## Implementation layout

- `shared/definitions.ts`: seven fighters, balance values, map geometry, math.
- `shared/types.ts`: public room, match, and message schemas.
- `shared/engine.ts`: authority over movement, collision, damage, abilities, hazards, ball physics, scoring, results.
- `shared/room.ts`: lobby validation, membership, reconnect sessions, match lifecycle.
- `client/src/network.ts`: PeerJS transport, host fixed-timestep loop, message routing, limits, snapshots.
- `client/src/game.ts`: Phaser renderer, client movement smoothing, desktop input, effects.
- `client/src/main.tsx`: React menus, HUD, results, settings, multi-pointer touch sticks.
- `client/public/art/`: original placeholders and custom Brandon/Ethan portrait art for the current 2D presentation.
- `tests/engine.test.ts`: gameplay and room transition regression tests.
- `docs/PILOT-SPEC.txt`: supplied design document, renamed GOC Royale and amended for the chosen hosting model.
- `docs/STATUS.md`: verified behavior and remaining release work.

The host simulates 30 fixed ticks/second and sends 30 snapshots/second. Guests send bounded movement/aim/action inputs. Guests cannot supply damage, HP, ball ownership, or scores. Projectiles and the ball use small swept substeps to avoid tunneling. The renderer predicts local movement, corrects toward the host, and smooths remote snapshots. This is lightweight reconciliation rather than a full input-acknowledgement replay protocol.

## Design and character production

- [Shared character pipeline](docs/CHARACTER_3D_PIPELINE.md): the same eight production passes and face, finger, clothing and verification requirements for all seven fighters.
- [Art and audio direction](docs/ART-AND-AUDIO-DIRECTION.md): painterly anime-inspired chibi style, individual palettes, effects, UI and sound.
- [Brandon asset specification](docs/BRANDON_3D_ASSET.md): first individual production brief; other fighters need their own before modeling.
- [Performance and gameplay standards](docs/PERFORMANCE-AND-GAMEPLAY-STANDARDS.md): mandatory runtime limits and acceptance gates.

The next 3D assets are planned production work. Existing studies and portraits do not establish completion of the new standard or a live 3D multiplayer renderer.

## Trust and scope

Host authority is appropriate for a private, trusted friend group: the host can alter their own browser, see hidden state, and cheat. A browser-only build cannot provide independent anti-cheat. Private room codes are invitations, not authentication or confidentiality guarantees. WebRTC data channels are encrypted in transit; peers may learn one another's network addresses through ICE. No analytics, microphone, or camera are used.

There is no public matchmaking, progression, gadgets, extra fighters, or additional mode. The placeholders and synthesized music/effects are original; fonts are self-hosted via Fontsource with included font licenses. See `docs/STATUS.md` before calling this a completed pilot release.

Latest roster update: Ethan uses Rizz (two 420-damage notes) and Aura Pulse (instant knockout of enemies within 4 units, blocked by walls and spawn protection). Brandon's current 2D portrait uses blue/gold; the next 3D specification uses a beige jacket with unchanged mechanics. The camera follows your fighter at 1.65× arena-fit scale, or the selected survivor when spectating. Movement changes and actions send on the next rendered frame; steady inputs remain 30 Hz. Remote smoothing is shortened to 35 ms. Actual Internet delay is not eliminated; the doubled snapshot rate uses more bandwidth.
