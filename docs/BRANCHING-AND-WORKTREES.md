# GOC Royale branch and workspace standard

**Status:** Mandatory repository standard
**Applies to:** every agent and contributor that creates a branch, starts work on a branch, commits, merges, or pushes
**Last updated:** October 30, 2026

## 1. Purpose

Several agents may work on this repository at the same time. A Git folder has
one checked-out branch and one working tree, so two agents sharing a folder can
switch the branch under each other, overwrite files, or commit each other's
uncommitted work. This standard prevents that by giving every branch its own
folder through `git worktree`.

## 2. Rules

1. **One branch, one folder.** Every new branch MUST be created in its own
   worktree. Do not run `git checkout` or `git switch` to change branches in a
   folder another agent may be using, including the primary folder.
2. **Work only in your folder.** Read, edit, build, and test only inside the
   worktree for your branch. Do not modify files in another worktree.
3. **Stage by explicit path.** Use `git add <path>` for the files you changed.
   Do not use `git add -A`, `git add .`, or add a shared file without first
   checking `git diff <file>` for changes that are not yours. A file can contain
   another session's uncommitted edits.
4. **Never rewrite or force-push shared history.** Rewriting is allowed only for
   unpushed local commits on your own branch, and only with a backup branch.
5. **`main` is production.** Pushing `main` deploys to
   https://goc-royale.vercel.app through Vercel. Merging into or pushing `main`
   requires explicit user approval, a green `npm test` and `npm run build` on
   the merge result, and the gates in `AGENTS.md`.
6. **Report your workspace.** In your first progress update, state the branch
   and the absolute worktree path you are using.

## 3. Layout and naming

| Item | Convention |
|---|---|
| Primary folder | `~/Documents/GitHub/GOC Royale` (original clone) |
| Worktrees | `~/Documents/GitHub/goc-royale-wt/<slug>` |
| Slug | Branch name with `/` replaced by `-`, e.g. `feature/zone-render` → `feature-zone-render` |
| Branch prefixes | `feature/`, `fix/`, `refactor/`, `perf/`, `art/`, `docs/` |

Start new branches from an up-to-date `main` unless the user names another base.

## 4. Creating a workspace

From any existing folder of this repository:

```sh
git fetch origin
git worktree list                       # see which branches are already in use
git worktree add -b feature/my-change \
  ../goc-royale-wt/feature-my-change origin/main
cd ../goc-royale-wt/feature-my-change
npm ci                                  # each worktree needs its own node_modules
```

To work on an existing branch, omit `-b`:
`git worktree add ../goc-royale-wt/<slug> <branch>`. Git refuses if that branch is
already checked out elsewhere; that refusal is intentional.

Do not symlink `node_modules` between worktrees; branches can have different
dependencies.

## 5. Environment differences between worktrees

Ignored files are **not** shared. A new worktree does not have:

- `.env` or `.env.*` — copy only if your task needs it. Never commit them.
- `node_modules/`, `dist/` — created by `npm ci` / `npm run build`.
- `outputs/`, `work/` — renders, reports, and deployment scratch stay in the
  folder that produced them. Reference them by absolute path if needed.

Committed files, branches, and commits are shared immediately across all
worktrees because they use one repository.

## 6. Ports

Each running dev server needs its own port:

| Use | Port |
|---|---|
| Primary folder game dev server | 5173 (Vite default in `vite.config.ts`) |
| Art preview server (`client/public/art3d`) | 5180 |
| Additional worktrees | 5174–5179, then 5190+; pick a free one |

Start an extra game server with `npx vite --host 0.0.0.0 --port 5174 --strictPort`.
Check what is in use with `lsof -iTCP -sTCP:LISTEN -P | grep node`.

## 7. 3D and Blender exception

- 3D asset work under `assets/3d/` stays in the **primary folder**. Existing
  Blender scripts and READMEs use absolute paths to that folder, and running them
  from a worktree writes into the wrong place.
- There is one live Blender session. Only one agent may drive Blender at a time,
  whatever the branch. Git worktrees cannot isolate it.
- If the primary folder is occupied by 3D work, do code, docs, and gameplay work
  in a worktree instead.

## 8. Shared files

Some files are edited by many branches:

- `docs/STATUS.md`: append your own dated section. Do not rewrite another
  branch's section. When merging, keep both sides.
- `AGENTS.md`, `README.md`, `docs/PERFORMANCE-AND-GAMEPLAY-STANDARDS.md`: change
  only the parts your task requires; keep unrelated edits intact during merges.

Before merging into `main`, merge or rebase the latest `main` into your branch,
resolve conflicts in your worktree, and rerun the verification gates there.

## 9. Finishing

```sh
git push -u origin <branch>             # share the branch (does not deploy)
# after the branch is merged:
git worktree remove ../goc-royale-wt/<slug>
git worktree prune
```

`git worktree remove` refuses when the folder has uncommitted changes. Commit or
discard them deliberately; do not use `--force` on someone else's work.

## 10. Checklist

- [ ] `git worktree list` checked; branch not already in use
- [ ] Worktree created under `goc-royale-wt/`, `npm ci` run
- [ ] Branch and worktree path stated in the first progress update
- [ ] Dev server, if any, on a free port
- [ ] Only my files staged, by explicit path
- [ ] `main` merged into the branch and gates rerun before any merge to `main`
- [ ] User approval before merging into or pushing `main`
- [ ] Worktree removed after merge
