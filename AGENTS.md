# GOC Royale agent instructions

These instructions apply to the entire repository.

## Mandatory branch and workspace standard

Before creating a branch, starting work on a branch, committing, merging, or
pushing, read all of:

- `docs/BRANCHING-AND-WORKTREES.md`

Multiple agents may work on this repository at once. Every branch MUST have its
own `git worktree` folder; never switch branches in a folder another agent may be
using. Stage only your own files by explicit path. Merging into or pushing `main`
deploys production and requires explicit user approval. In the first progress
update, state the branch and absolute worktree path you are using.

## Mandatory performance and gameplay standard

Before planning, reviewing, or changing anything related to gameplay, networking,
simulation, rendering, animation, audio, controls, HUD, menus, results, game art,
3D assets, asset loading, or runtime performance, read all of:

- `docs/PERFORMANCE-AND-GAMEPLAY-STANDARDS.md`

This is a required first step, not optional background reading. In the first
progress update, explicitly confirm that the standard was read and identify the
sections and acceptance gates relevant to the task.

Do not copy an existing implementation pattern merely because it is already in
the codebase. The standards document identifies known prototype shortcuts that
must be treated as migration debt rather than conventions.

## Mandatory code practices standard

Before planning, reviewing, or changing any client code, and always before
adding a component, class, hook, module, screen, control, HUD element, or 3D
menu scene content, read all of:

- `docs/CODE-PRACTICES.md`

All player-facing UI MUST be built from the two kits it defines (`menuKit` and
`gameKit`, both from one factory) and the single `Control` / `Display`
interface. Extend an existing kind, variant, or profile before adding anything
new. Do not create a new component or class per request. In the first progress
update, confirm the standard was read and name the kit kinds the task uses or
extends. The performance standard takes precedence where the two conflict.

## Required working behavior

1. Classify the work before editing: simulation, networking, rendering,
   animation, feedback, game UI, asset pipeline, or more than one of these.
2. Preserve authoritative gameplay rules unless the user explicitly requests a
   rules or balance change. Rendering and animation work must not silently alter
   collision, damage, timing, visibility, or scoring.
3. Keep simulation, network transport, presentation, and React UI update rates
   independent. Do not couple them for convenience.
4. Prefer immediate local presentation with later authoritative reconciliation.
   Never make basic input feedback wait for a network round trip.
5. Do not add a second live arena renderer, high-frequency React state path, or
   unbudgeted 3D asset without documenting and verifying the performance cost.
6. Any exception to a `MUST`, `MUST NOT`, or numeric budget in the standard needs
   a written rationale, measured evidence, and an explicit user decision.
7. Keep changes scoped. Do not add progression, monetization, public
   matchmaking, or other features outside the approved pilot to disguise weak
   core game feel.

## Verification

At minimum, gameplay-facing changes must pass:

```sh
npm test
npm run build
```

They must also satisfy the task-specific verification matrix in
`docs/PERFORMANCE-AND-GAMEPLAY-STANDARDS.md`. Unit tests alone do not certify
latency, animation quality, mobile controls, frame pacing, or game feel.

When runtime architecture, performance budgets, asset budgets, or acceptance
evidence changes, update the standards document or `docs/STATUS.md` in the same
change. Do not let implementation and documented constraints drift apart.

