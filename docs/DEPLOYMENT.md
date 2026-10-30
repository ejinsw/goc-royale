# GOC Royale deployment

Verified October 25, 2026 (America/Los_Angeles).

## Live release

- Public URL: https://goc-royale.vercel.app
- Deployment URL: https://goc-royale-igkqawyvi-elijah-wons-projects.vercel.app
- Deployment ID: `dpl_3Bw2ZR3sFmBPs1GaJi7za3E63uN2`
- Dashboard: https://vercel.com/elijah-wons-projects/goc-royale/3Bw2ZR3sFmBPs1GaJi7za3E63uN2
- Account scope: `elijah-wons-projects`; CLI verified plan `hobby`.
- Static hosting only. No backend, database, Functions, paid services, environment credentials, or Git integration configured.

The public production alias returned HTTP 200 without authentication. The CLI lists Vercel authentication protection for deployment URLs; use the public production alias when inviting friends.

## Exact version and preservation

This directory has no `.git` repository. Git status/diffs and a commit identity are unavailable; no history was initialized or changes discarded.

The live release is the original pre-existing `dist/` with the earlier cream/green “Meet you in the arena” menu, plus a hosting-only `vercel.json`. It includes the existing Brandon/Ethan PNG art and seven-fighter roster. It does **not** contain the unfinished “CREATE PARTY” menu redesign in the current `client/src/main.tsx`.

Only `client/src/main.tsx` differed between the allowlisted current source snapshot and matching files in the existing `outputs/GOC-Royale-source.zip`. Current main references classes including `fighter-showcase` that are absent from current CSS. The archived main was substituted only inside an isolated verification copy; rebuilding produced a complete byte-for-byte match of every file in original `dist/`, including JS, CSS, fonts, art and HTML. No original menu, artwork, gameplay or dist files were edited.

- Current main SHA-256: `a48a4088c085eb6391973031017d160094a02f12dd8aa43f485cf9e9b07b1128`
- Deployed archived main SHA-256: `8701dda914ca296db848d38a6c00524a8e4c02f057fd208edcf70c80b1562c53`
- Canonical sorted publish-manifest SHA-256: `7e64891766a1f0db2357e723a32aa5e4e3af35f31d879237a52dd83bc01b8289`
- Bundle entry: `/assets/index-BU5YzQqB.js`; gameplay: `/assets/game-CB_UkPXf.js`; CSS: `/assets/index-CRngCkwy.css`.

Preserved files:

- `work/deployment-2026-10-25/source/`: allowlisted current source snapshot, independently built without touching original dist.
- `work/deployment-2026-10-25/original-dist/`: original static release snapshot.
- `work/deployment-2026-10-25/verified-source/`: reproducible source using archived main, otherwise current matching source.
- `work/deployment-2026-10-25/publish/`: uploaded static files and Vercel config.
- `outputs/deployment/GOC-Royale-deployed-2026-10-25.zip`: portable static release, no account metadata or credentials.
- `outputs/deployment/publish-manifest.json`: each uploaded static/config file SHA-256.
- `outputs/deployment/source-manifest.json`: current allowlisted source SHA-256 hashes.
- `outputs/deployment/public-integrity.json`: all 32 public static files fetched from production and checked against original hashes.

Only client/shared/tests and explicitly selected package/build configuration files were copied for build work. Source ZIP extraction was limited to its known main.tsx entry. No private files, design documents, source archives, scratch work or source code were uploaded. The upload was made from the isolated static publish directory. An initial CLI project setup was interrupted before upload when it selected the project root; the completed deployment was from the isolated folder. CLI added root `.vercel/` metadata and appended `.vercel` to `.gitignore`. Vercel link generated a local OIDC env file; it was moved out before deployment and subsequently removed. It was never used as a client build variable. No paid upgrade or purchase was made.

## Hosting eligibility and limits

Official documents checked on the date above:

- [Vercel Hobby](https://vercel.com/docs/plans/hobby): free for personal, non-commercial use. This private friend-group game fits that stated purpose as described; reassess before commercial or organizational use. Included resources relevant to static hosting: 100 GB Fast Data Transfer, 10 GB Fast Origin Transfer, 1 million CDN requests; 100 deployments/day. Exceeding Hobby allowances generally requires waiting until usage becomes available again, rather than enabling paid usage.
- [Vercel limits](https://vercel.com/docs/limits): Hobby CLI upload limit 100 MB; build limit 45 minutes. This upload is approximately 6.23 MB, 33 static/config files; cloud build disabled.
- [Cloudflare Pages limits](https://developers.cloudflare.com/pages/platform/limits/): alternative Free plan allows 500 builds/month, 20,000 files, 25 MiB per asset. It was not needed because Vercel Hobby was suitable and authorized. No Cloudflare or Netlify deployment/account setup was performed.

Keep the project on Hobby. Do not enable a Pro trial, paid integration, TURN subscription or paid usage to resolve a limit. Static traffic consumes Vercel allowances; match snapshots travel between browsers rather than through Vercel.

## Routing, caching and credentials

The deployed `vercel.json` disables cloud install/build and serves the isolated directory. Ordered routes set headers, serve existing files, then fall back to index.html for extensionless paths. Hashed `/assets/*` files use `public, max-age=31536000, immutable`. HTML and unversioned files including `/art/*` use `public, max-age=0, must-revalidate`. Missing asset files retain 404 behavior instead of receiving HTML.

Actual invites use `/?room=ABCDEF` and need no pathname rewrite. Root invites, extensionless SPA fallback and direct static assets returned HTTP 200 over HTTPS; cache and security headers were inspected on production. MIME types were correct. The uploaded `_headers` is an existing static artifact; Vercel uses `vercel.json` for these rules.

No project `.env` was read or bundled. Build copies have no env files. VITE_TURN variables are unset. All `VITE_*` values are public client code; never add account/API secrets there.

## PeerJS and WebRTC

The app calls PeerJS with its default cloud signaling host, `0.peerjs.com`, port 443. HTTPS provides secure signaling; actual public room creation and guest connection succeeded. App-supplied ICE config includes only `stun:stun.l.google.com:19302`, overriding PeerJS default ICE configuration. No TURN relay is configured.

[PeerJS FAQ](https://peerjs.com/client/faq) documents free cloud signaling and direct browser data connections. That supports a small private pilot; no availability SLA or universal connectivity is established by this test. Keep the creator tab open and active. Host refresh/departure ends the room, with no host migration. Background/mobile tab throttling can degrade simulation. Restrictive NAT, carrier or enterprise networks may fail without TURN; do not claim universal access. The optional TURN path exists but no relay was provisioned or paid for.

## Verification

- Node 22.13.0; Vercel CLI 65.2.0; npm locked dependencies already installed locally.
- `npm test`: all 48 tests passed in isolated current-source snapshot.
- `npm run build`: strict TypeScript check and production Vite build passed for current source and again for archived-main verification copy.
- Build warning: Phaser gameplay chunk is about 1.49 MB uncompressed; no build failure. Mobile loading performance was not benchmarked.
- Every file in reproduced dist matched original dist; all 32 public static files were fetched via HTTPS and SHA-256 matched after deployment.
- Public URL opened in two real browser tabs, same computer/network, no mocked transport.
- Host created room DRTBMP; guest opened its direct query-string invite; room code populated correctly; guest joined through PeerJS cloud.
- Host selected Daniel; guest selected Ethan; both ready states replicated; host launched Showdown; both displayed countdown and then active match with two players.
- Real held keyboard inputs moved both fighters. Host movement was visible on guest canvas; guest approach became visible next to host on host canvas. Evidence: `outputs/deployment/showdown-replication.png`.
- Browser warning/error logs were empty on both tabs during tested flow.
- Menu checked at 390×844 and 844×390: document width equaled viewport width, no horizontal overflow; art loaded. Portrait gameplay also rendered. Evidence: `outputs/deployment/mobile-menu.png`.
- Viewport testing retained desktop pointer characteristics. Real phone touch joysticks, multi-touch, portrait rotation prompt, Safari, separate devices/networks, restrictive NAT and TURN behavior remain **unverified**. Two tabs are real clients but do not establish cross-network reliability.
- Six-player Broomball was covered by protocol tests, not six public browser clients. No claim of full public multiplayer/load testing.

## Updates

Do not deploy from the project root: it contains unfinished menu work and private/local materials. Do not blindly rebuild root dist for this release.

For an unchanged re-deploy, use the existing isolated publish folder (or unpack the portable release ZIP to a new empty folder). Keep only static files and vercel.json in the upload. In that folder:

```sh
npx vercel@65.2.0 login
npx vercel@65.2.0 link --yes --project goc-royale --scope elijah-wons-projects
# Linking may generate .env.local. Remove that generated file before any build/upload;
# do not copy any personal env files. The release .vercelignore excludes .env*.
npx vercel@65.2.0 deploy --prod --yes --scope elijah-wons-projects
```

CLI login is only needed when logged out. Verify the selected scope is still Hobby with `npx vercel@65.2.0 teams ls` first. For a new source release, take a fresh allowlisted copy, review menu/CSS/art consistency with the art agent, run tests and production build there, replace static contents of a separate publish directory, and carry forward the reviewed Vercel config. Never include source/private files in the static publish folder. Repeat public hash, invite, caching and two-client checks after each deployment. Keep the previous release ZIP and deployment URL until the new release is verified.

## Rollback

There is no earlier Vercel production release from before this work. This deployment is the baseline for future rollbacks. To restore it later, unpack `outputs/deployment/GOC-Royale-deployed-2026-10-25.zip` into an empty isolated folder, link to the same Hobby project, and deploy as above. This republishes the exact static baseline without rebuilding source. Verify the manifest and public URL afterward. Deployment-URL promotion/rollback availability can vary by plan; the static ZIP re-deploy route does not depend on that feature. Clients must reload to receive a new HTML entry; do not interrupt active hosted rooms unnecessarily.
