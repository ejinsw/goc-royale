# Ministry teams and leaders brief

**Branch:** `feature/ministry-teams`
**Worktree:** `~/Documents/GitHub/goc-royale-wt/feature-ministry-teams`
**Base:** `main` at `67bafc3` (the game-style UI pass)
**Status:** Implemented November 2, 2026. Every named ministry leader is a
playable fighter (17 total). Balance values are first-pass and untested in
real play; see "Open items".

## Goal

Represent the rest of GOC's ministry teams and their leaders in the game,
rather than only the seven pilot fighters.

## Source data

Supplied by the user from the GOC ministry teams page. **Contact details were
deliberately left out of this repository**: the art and audio direction
requires that contact information stay out of shipped assets, and the
supplied list included team email addresses and a personal phone number.
Those are not recorded here. Team names, descriptions and leader names are
kept because they are the content being represented.

| Ministry team | Leader(s) | Fighter |
|---|---|---|
| Music Team | Ethan Ha | `ethan` (pilot) |
| Fisherman's Team | Dylan Yu | `dylan` |
| Admin Team | Isaac Wong | `isaac` |
| Homeless Outreach | Tovya Michael | `tovya` |
| Welcome and Follow Up Team | Rosalie Chiang, Brandon Kam | `rosalie`, `brandon` (pilot) |
| Rides Team | Daniel Hon, Joelle Lai | `daniel` (pilot), `joelle` |
| Media Team | Rich Lai, Susannah Tsai | `rich` (pilot), `susannah` |
| Care Team | Samuel Lam, Joyce Lin | `samuel` (pilot), `joyce` |
| Prayer Team | Miriam Tong, Jemuel Lee | `miriam`, `jemuel` |
| Sound Team | Josh Chang | `josh` (pilot) |
| Finance Team | Russell Mo | `russell` |
| Web Team | Elijah Won | `elijah` (pilot) |
| Video Resources | none listed | none |

### Team descriptions, for ability and identity design

- **Music Team**: worship in spirit and truth; recounting God's works and
  responding in joyful praise.
- **Fisherman's Team**: cold-contact evangelism, "fishers of men"; sharing
  the gospel with strangers outside normal routine.
- **Admin Team**: event planning and scheduling, the logistical side of
  ministry, so the shepherd can devote himself to preaching.
- **Homeless Outreach**: cooking and serving food weekly with partner
  churches, building relationships and meeting physical and spiritual need.
- **Welcome and Follow Up**: welcoming one another as Christ welcomed us;
  serving at large group and encouraging love for the body and for
  nonbelievers.
- **Rides Team**: organizing carpools to Sunday service and off-campus
  events, intentionally mixing groups each week to build fellowship.
- **Media Team**: graphic design, announcement slides, apparel, event
  photography, and the fellowship's social presence.
- **Care Team**: in-reach; making sure members are cared for through
  projects like Christmas Grams and Midterm Munchies.
- **Prayer Team**: praying for the fellowship and church, and growing in
  personal prayer; weekly devotional and prayer together.
- **Sound Team**: assembling and running the audio/visual system: lights,
  slides and sound, so others can hear the sermons and songs.
- **Finance Team**: budgets and reimbursements; stewarding what God has
  provided and allocating for teams and events.
- **Web Team**: maintaining the website and mobile app; announcements,
  sermon recordings, rides and resources.
- **Video Resources**: no description or leader supplied.

## Decisions (user request, November 2, 2026)

1. **Full fighters.** Every named leader without a fighter became a
   playable fighter: ten new fighters, roster 7 → 17. This deliberately
   extends the pilot specification's seven-fighter scope.
2. **Co-leaders** each get their own fighter on their team.
3. **Names and likeness.** Fighters ship with first names only, as the pilot
   roster does. Art stays fictional: none of the ten has a supplied likeness
   reference, so their looks are provisional game designs, not claims about
   the people.
4. **Rosalie** is based on a summoner archetype (the user named Brawl
   Stars' Nita): a piercing wave attack and a Super that throws out a
   companion that chases rivals. Her companion is a giant red panda in the
   spirit of the one in *Turning Red*, and she wears a red-panda-ear hood.
   Both are original designs drawn from a real red panda's markings. No
   character art, model or name is copied from either property, as the pilot
   specification requires.
5. **Video Resources** has no leader, so it has no fighter.
6. **Every 3D model has a distinctive feature** (user request), including the
   seven pilot fighters, and future model changes must be easy (below).

## Kits

All ten have 3 ammo. Single-target damage per reload runs from 400 (Joelle,
one leg; 800 when both legs hit) to 875 (Tovya). The pilot roster spans
538–1,031. Dylan, Susannah, Miriam and Joyce (480–500) sit below it and trade
damage for utility: tug, chain, slow, homing. Super damage never charges
Super, as in the pilot rules.

| Fighter | Team | Role | HP | Speed | Basic attack | Super |
|---|---|---|---:|---:|---|---|
| Dylan | Fisherman's | Catcher | 6,000 | 5.2 | **Line Cast**: 720, range 7.5, reload 1.5. Reels the target 1.2 units toward Dylan (a tug, not a knockback, so carriers keep the ball). | **Fishers of Men**: a net thrown 4.5 units lands after a visible 0.4 s marker. Radius 3: 500 damage, drags rivals to its center, 0.8 s stun. Stops at cover. |
| Isaac | Admin | Defender | 6,200 | 5.2 | **Stapler**: a burst of 3 staples, 330 each, 0.09 s apart, per ammo. Range 8. A stun or ball pickup cuts the burst short. | **Room Setup**: a 4-unit barrier of folding tables 1.8 ahead for 6 s, 3,000 HP. It blocks enemy shots only, not movement, cones, Supers or the ball. |
| Tovya | Homeless Outreach | Brawler | 7,600 | 5.2 | **Ladle Swing**: a 110° cone, range 2.6, 1,050 to every rival in it, reload 1.2. | **Dinner's Ready!**: leaps up to 6 units over cover in 0.5 s, then slams down: radius 2.5, 1,200 damage, 1.5 knockback. Cannot act mid-air. |
| Rosalie | Welcome & Follow-Up | Summoner | 5,400 | 5.2 | **Warm Welcome**: a wide wave (hit width 0.35) that pierces every rival in its path. 800, range 6.5. | **Follow-Up Panda**: throws out a red panda 3 units ahead. It has 3,600 HP, lasts 12 s, chases the nearest visible rival within 9 and swipes for 500 every 0.8 s. Shots and cones can destroy it. It leaves when Rosalie is eliminated, and a new panda replaces the old one. |
| Joelle | Rides | Skirmisher | 5,000 | 5.8 | **Round Trip**: a boomerang that pierces, 560 on the way out and 560 on the way back. Range 7. | **Mix It Up**: a Super shot (speed 20, range 9) deals 500, stuns 0.5 s, and swaps places with the first rival hit. |
| Susannah | Media | Thrower | 4,800 | 5.2 | **Share Post**: 720, then chains 450 to the nearest other visible rival within 3.5. | **Merch Drop**: a lob 6 units over cover lands after a 0.6 s marker. Radius 2.3, 1,300 damage, 1.5 knockback. |
| Joyce | Care | Support | 5,300 | 5.2 | **Care Note**: 700, range 8.5. It curves up to 2.6 rad/s toward visible rivals ahead. | **Christmas Grams**: 1,800 healing to herself and every teammate anywhere, plus 1 s of protection. |
| Miriam | Prayer | Peacekeeper | 5,200 | 5.2 | **Peace Dove**: 680, slows 30% for 1.5 s (the strongest slow applies, slows never stack). | **Be Still**: radius 3.5 around her, 400 damage and a 1.25 s stun. |
| Jemuel | Prayer | Guardian | 6,800 | 5.2 | **Morning Light**: a ring of light around him, range 2.8, 900 to every rival in it. | **Prayer Covering**: a 2,000 shield for 6 s on himself and teammates within 4.5. Shields absorb damage first. Absorbed damage still counts as dealt. |
| Russell | Finance | Disruptor | 5,500 | 5.2 | **Reimbursement**: 760, refunds 35% of the damage dealt as health. | **Budget Cuts**: radius 4.5 around him, 700 damage, and rivals' ammo is emptied. |

Aura Pulse (Ethan) still knocks out a shielded rival: "knockout" removes the
shield as well.

## How it is built

**Abilities are data.** `shared/definitions.ts` gives every fighter an
`abilities: { attack, super }` entry built from a few kinds: `shot` and
`cone` attacks, and `zone`, `frame`, `charge`, `rewind`, `burst`, `leap` and
`shot` Supers. Options such as `pierce`, `returns`, `homing`, `chain`, `tug`,
`slow`, `lifesteal`, `pull`, `drain`, `shield` and `protect` configure them.
Placed objects (Welcome Committee, the snack table, the red panda, the
barrier) are rows in `AREAS`. `shared/engine.ts` has one resolver per kind
and no longer branches on any fighter id. The seven pilot fighters were
converted to the same data, and every pre-existing engine test passes
unmodified.

**3D looks are data.** `client/src/ui/scene/fighterModels.ts` has one
`LOOKS` row per fighter: palette, hair style, a list of named `features`, a
held `prop`, and an optional `companion`. Each feature, prop, hair style and
companion is one entry in its own table and names the rig part it rides on.
So:

- To restyle a fighter, edit its `LOOKS` row.
- To add a distinctive characteristic, add one `FEATURES` entry and put its
  name in any fighter's `features` list.
- Hats listed in `CROWN_COVERS` hide the fringe automatically.
- Name plates rise above tall hats from the measured model height.

| Fighter | Distinctive feature(s) | Prop / companion |
|---|---|---|
| Brandon | glasses, nametag (new) | clipboard |
| Daniel | backward cap (new) | keys |
| Rich | glasses, camera strap (new) | camera |
| Samuel | apron (new) | cookie |
| Josh | headphones (new) | speaker |
| Elijah | glasses, hoodie (new) | laptop |
| Ethan | spiky hair, plush charm (new) | guitar, floating note |
| Dylan | bucket hat | fishing rod |
| Isaac | event headset | stapler |
| Tovya | chef hat | ladle |
| Rosalie | red-panda-ear hood, braids | mini red panda |
| Joelle | sunglasses, ponytail | steering wheel |
| Susannah | beret, long hair | phone |
| Joyce | pom-pom beanie, long hair | envelope |
| Miriam | hair bun | devotional book, floating dove |
| Jemuel | scarf | lantern |
| Russell | bow tie | calculator |

Arena presentation follows the same rule. Projectile looks are rows in
`SHOT_LOOKS` in `client/src/game.ts`. Cones, frames and bursts are drawn from
the owner's fighter data, so the drawn area matches the authoritative hit
area. New portraits are placeholder SVGs in `client/public/art/` that mirror
the 3D looks. `client/src/art.ts` lists which fighters use a PNG.

Also on this branch:

- `shared/room.ts` seeded first picks with `IDS[i % 6]`, which never offered
  the seventh fighter or any later one. It now uses the whole roster.
- The picker strip uses one row on phones and short screens, and two rows on
  tall landscape screens.

## Verification

- `npm run typecheck`, `npm test` (104 tests, 19 new) and `npm run build`
  pass. New tests cover each new mechanic, a smoke run of every fighter's
  attack and Super in both modes with a JSON-safe snapshot check, the room's
  default picks, and every 3D look building within a triangle ceiling with a
  unique silhouette.
- The real menu scene (WebGL, headless Chromium) rendered all 17 fighters and
  solo close-ups of the ten new ones. The real Phaser arena, driven by a
  local authority, ran each new kit's attack and Super with no page errors.
  The fighter picker was checked at 390×844, 844×390 and 1280×720 with no
  horizontal overflow.
- Measured in Node over scripted 40 s matches with Supers. Delta-encoded
  snapshots peak at 32 KB/s per viewer and 2.6 Mbps host outbound for
  10-player Showdown made mostly of the new kits (pilot roster: 32 KB/s,
  2.6 Mbps). Authority step p95 is 0.09 ms (pilot roster 0.13 ms).
- Menu models are 5.9k–10.5k triangles each. The pilot seven grew by
  0.4k–1.3k each for their new features.

## Open items

- **Balance and feel.** No human playtest and no two-client networked match
  has been run with the new fighters; the standard requires two-client
  verification for balance changes. Values are first-pass.
- **Likeness.** No references were supplied for the ten new leaders; their
  looks are provisional.
- **Production 3D.** `docs/CHARACTER_3D_PIPELINE.md` still requires an
  individual specification per fighter before production modeling. The
  procedural menu looks are not production assets.
- **Video Resources**: needs a leader or a decision to drop it.
- **Presentation debt.** New Super cues are synthesized tones, and the leap
  arc and panda are drawn shapes. Neither has animation clips, which matches
  the existing prototype debt in the performance standard §10.
