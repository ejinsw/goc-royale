# Ministry teams and leaders brief

**Branch:** `feature/ministry-teams`
**Worktree:** `~/Documents/GitHub/goc-royale-wt/feature-ministry-teams`
**Base:** `main` at `67bafc3` (the game-style UI pass)
**Status:** Source data and analysis only. No roster or gameplay change has
been made on this branch yet.

## Goal

Represent the rest of GOC's ministry teams and their leaders in the game,
rather than only the seven fighters that exist today.

## Source data

Supplied by the user from the GOC ministry teams page. **Contact details were
deliberately left out of this repository**: the art and audio direction
requires that contact information stay out of shipped assets, and the
supplied list included team email addresses and a personal phone number.
Those are not recorded here. Team names, descriptions and leader names are
kept because they are the content being represented.

| Ministry team | Leader(s) | In game today |
|---|---|---|
| Music Team | Ethan Ha | yes — `ethan` |
| Fisherman's Team | Dylan Yu | no |
| Admin Team | Isaac Wong | no |
| Homeless Outreach | Tovya Michael | no |
| Welcome and Follow Up Team | Rosalie Chiang, Brandon Kam | partly — `brandon` |
| Rides Team | Daniel Hon, Joelle Lai | partly — `daniel` |
| Media Team | Rich Lai, Susannah Tsai | partly — `rich` |
| Care Team | Samuel Lam, Joyce Lin | partly — `samuel` |
| Prayer Team | Miriam Tong, Jemuel Lee | no |
| Sound Team | Josh Chang | yes — `josh` |
| Finance Team | Russell Mo | no |
| Web Team | Elijah Won | yes — `elijah` |
| Video Resources | none listed | no |

### Team descriptions, for ability and identity design

- **Music Team** — worship in spirit and truth; recounting God's works and
  responding in joyful praise.
- **Fisherman's Team** — cold-contact evangelism, "fishers of men"; sharing
  the gospel with strangers outside normal routine.
- **Admin Team** — event planning and scheduling, the logistical side of
  ministry, so the shepherd can devote himself to preaching.
- **Homeless Outreach** — cooking and serving food weekly with partner
  churches, building relationships and meeting physical and spiritual need.
- **Welcome and Follow Up** — welcoming one another as Christ welcomed us;
  serving at large group and encouraging love for the body and for
  nonbelievers.
- **Rides Team** — organizing carpools to Sunday service and off-campus
  events, intentionally mixing groups each week to build fellowship.
- **Media Team** — graphic design, announcement slides, apparel, event
  photography, and the fellowship's social presence.
- **Care Team** — in-reach; making sure members are cared for through
  projects like Christmas Grams and Midterm Munchies.
- **Prayer Team** — praying for the fellowship and church, and growing in
  personal prayer; weekly devotional and prayer together.
- **Sound Team** — assembling and running the audio/visual system: lights,
  slides and sound, so others can hear the sermons and songs.
- **Finance Team** — budgets and reimbursements; stewarding what God has
  provided and allocating for teams and events.
- **Web Team** — maintaining the website and mobile app; announcements,
  sermon recordings, rides and resources.
- **Video Resources** — no description or leader supplied.

## What the current roster looks like

`shared/definitions.ts` defines exactly seven fighters, each with a `team`
string that already matches a ministry team, plus a role and a full kit: hp,
speed, ammo, reload, damage, range, projectile speed, a named attack, a named
Super, a color, and two description strings.

Gaps against the list above:

- **Five teams with named leaders have no fighter:** Fisherman's, Admin,
  Homeless Outreach, Prayer, Finance. Prayer lists two leaders.
- **Four existing teams have a co-leader with no fighter:** Rosalie Chiang,
  Joelle Lai, Susannah Tsai, Joyce Lin.
- **Video Resources** has no leader and no description, so it is unclear
  whether it is a team at all or a section of the source page. Needs a
  decision from the user.

Fully covering the list means up to ten new fighters, taking the roster from
7 to 17.

## Decisions needed before any implementation

1. **Fighters or something else.** Not every team has to become a playable
   fighter. The teams could appear as the existing `team` label, as a lobby
   or results flavor, as map or cosmetic content, or as full fighters. Adding
   ten fighters is the largest possible interpretation and the most work.
2. **Co-leaders.** If a team has two leaders, does it get two fighters, one
   fighter, or one fighter with the second leader credited elsewhere?
3. **Real names and likeness.** These are real people. The repo already notes
   that supplied surnames were used with art kept fictional, and the
   character pipeline requires per-fighter likeness decisions to be recorded.
   Confirm whose names may ship and that art stays fictional unless a
   reference is explicitly supplied and approved.
4. **Balance.** Each new fighter is a gameplay rules change needing a kit and
   balance pass. The standard treats simulation and balance changes as
   requiring unit tests, deterministic replay where applicable, and
   two-client verification.
5. **Art.** Every fighter needs portrait art for menus, lobby, results and
   the arena. Five current fighters use placeholder SVGs and two use
   generated PNGs. Ten more fighters means ten more portraits, and
   `docs/CHARACTER_3D_PIPELINE.md` requires an individual brief per fighter
   before any 3D modeling.

## Things that will need touching when it is implemented

- `shared/definitions.ts` — `FighterId`, `FIGHTERS`, and `IDS`. Note that
  `IDS` currently has seven entries and the engine indexes spawn points with
  a modulo fallback, so roster size and the player caps (Showdown 10,
  Broomball 6) are independent.
- `client/src/art.ts` — `hasPortraitArt` and `fighterArt` pick the file
  extension per fighter; new art must be registered there.
- `client/src/ui/scene/fighterModels.ts` — `LOOKS` has one row per fighter
  driving the procedural 3D model. A new fighter needs a row here or it will
  fail to build a model. This is the per-fighter look table the code
  practices doc refers to; extend the table, do not add a new model class.
- `client/src/ui/screens/FighterSheet.tsx` — the picker strip scrolls, but a
  17-fighter roster should be checked at 390 px wide.
- `shared/room.ts` — `addMember` seeds a fighter with `IDS[i % 6]`, which is
  **already a latent bug**: it only ever assigns the first six of the seven
  fighters. Worth fixing on this branch.
- `tests/engine.test.ts` — per-fighter kit coverage.

Minimum gates on every commit: `npm run typecheck`, `npm test`,
`npm run build`.
