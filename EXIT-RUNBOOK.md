# EXIT-RUNBOOK — Vercel to a Hetzner box running Coolify, in one weekend

Written and rehearsed on 2026-10-24 from `EXIT-RUNBOOK-session-prompt.md` (main `e288562` plus this package), in two places. The session's cloud container (x86, 4 CPUs) built the image in `Dockerfile` from a clean clone and ran it against a throwaway Postgres 17 with the migrations applied and no card data. The owner's Mac (M1 Pro) has no Docker, so it ran the same tree's standalone server the way the image runs it (`node server.js` in `.next/standalone/`, with `public/` and `.next/static/` copied in) against the Neon `dev` branch, where the data checks and the smokes ran. Nothing ran on a real box, no DNS record moved and nobody signed in off Vercel: those are the checklist below, with the DNS flip last and a 48-hour back-out beside it.

**Observed** is what a command returned in the rehearsal. **Read** is what a vendor's page said on 2026-10-24 (linked). **Inferred** is the session's conclusion from those. Unmarked lines are instructions.

## 1. What the rehearsal proved

All **Observed**. The cloud container had no card data, so card pages, card previews and the smokes ran on the Mac only; the Mac has no Docker, so the image's own numbers come from the cloud only.

| | Cloud: the image, x86, empty database | Mac: the standalone server, Neon `dev` |
|---|---|---|
| Build | from a clean clone in 63–98 s over three builds (86 s with nothing cached) | `pnpm build` in 28.9 s |
| Build memory | peaks at ~2.7 GB resident inside a 4 GB cap; finishes inside 3 GB (~2.3 GB); OOM-killed after 51 s inside 2 GB | 1.81 GiB at the peak, summed over the build's processes |
| Image | 98.4 MB compressed, 415 MB unpacked, 67 MB under `/app`; the build's secrets in no layer, no `docker history` entry and no file under `/app` | — |
| Start | first 200 about 1 s after `docker run` (6.8 s on the first start after the host rebooted), healthy after 2.3–2.7 s; `docker stop` in 168 ms | first 200 after 450–472 ms over three starts |
| Server memory | — | 143 MB idle, 294 MB at the smokes' peak |
| Main stylesheet | 148,685 B + 5,721 B: the Markdown kept out by `.dockerignore` | 164,959 B + 5,721 B: the tree as Vercel builds it, Markdown included |
| §3 step 2's surfaces | the security headers and CSP, a static chunk and the stylesheet, `/icon-192.png`, manifest, robots, `/sitemap.xml` and `/cards/sitemap/0.xml` (an empty corpus has no `1.xml`), `/api/health`, a guest deck's page and preview | all of them, plus `/cards/sitemap/1.xml`, a card page's `CDN-Cache-Control` and the card, hub and leader previews (65,975, 71,143 and 17,132 B) |
| Preview fonts | a guest deck's preview is the same 13,111 B from the container and from the standalone server built from the same tree, its title in Literata; with `assets/` removed it is 12,169 B in the fallback sans, so a byte check catches a lost trace | the titles in Literata, checked by eye |
| Deck preview limiter | requests 61 and 62 in one minute from one address: 429, `Retry-After: 57`, `Cache-Control: no-store`, the JSON error | — |
| `/_next/image?url=%2Ficon-192.png&w=48&q=75` | 404 | 404 |
| Smokes | — (no card data) | `smoke:hubs`, `sets`, `decks`, `optcg` and `combos` pass; `smoke:seo` passes but for one line (§3 step 3) |
| Card page, 20 parallel × 5 | — | p95 31.7 s on one connection, 6.7 s on 5, 4.0 s on 10 (§7.3) |
| Per request | — | card page 48 ms of CPU and 9 statements; card preview 161 ms and 2; hub preview 155.5 ms; leader preview 74 ms |
| Database round trip | — | `select 1` p50 122 ms, from the Mac to us-east-1 |

## 2. Before the weekend

1. **Pick the box** (§7.8 has the numbers). The Neon project is in AWS us-east-1 (**Observed**: the region in the `dev` branch's connection string), so the box goes in Hetzner's Ashburn, Virginia location (`ash`), next to it: every query a page runs crosses that distance. Hetzner's cheap CX and CAX plans are EU-only; in Ashburn the choice is the AMD CPX line (**Read**, [Hetzner](https://www.hetzner.com/cloud/regular-performance/)). Take a **CPX21** (3 vCPU, 4 GB, 80 GB, 2 TB traffic, €32.49 a month) with a 4 GB swap file, or a **CPX31** (4 vCPU, 8 GB, €62.99) for headroom. Make sure the plan can be created in `ash` before anything else: read without a browser on 2026-10-24, the page showed every plan as "currently unavailable", which may only be how it renders without JavaScript.
2. **Gather the values** before anything else, because Vercel may not give them back. Vercel's Secret variables are write-only after saving (**Read**, [Vercel](https://vercel.com/docs/environment-variables/sensitive-environment-variables)); `vercel env pull --environment=production` writes a placeholder for each (**Read**, [vercel env](https://vercel.com/docs/cli/env)). In Vercel → the project → Settings → Environment Variables, each Production variable is labelled Config or Secret. Every Secret comes from its source instead:

   | Variable | Build | Runtime | Where the value comes from |
   |---|---|---|---|
   | `DATABASE_URL` | yes | yes | Saturday: the `dev` branch's pooled string (your `.env.local`). Sunday: Neon console → the production branch → Connect → Pooled connection. |
   | `BETTER_AUTH_SECRET` | yes | yes | Your own copy (a password manager). It must be Vercel's exact value or every signed-in visitor is signed out once at the flip and the stored provider tokens become unreadable until each owner signs in again (harmless: `src/lib/auth/account-options.ts`). With no copy, generate a new one (`openssl rand -base64 32`) and accept that. |
   | `DISCORD_CLIENT_ID`, `GOOGLE_CLIENT_ID` | yes | yes | Discord developer portal → the app → OAuth2; Google Cloud console → Credentials → the OAuth client. Not secret. |
   | `GOOGLE_CLIENT_SECRET` | yes | yes | Google shows a secret once, at creation; a client can hold two enabled secrets at once (**Read**, [Google](https://support.google.com/cloud/answer/6158849?hl=en)). Without a copy, add a second secret for the box and leave Vercel on the first; disable the first after the back-out window. |
   | `DISCORD_CLIENT_SECRET` | yes | yes | Your copy. Without one, Discord's only path is Reset Secret, which ends the old secret (**Inferred**: one secret per app), so reset it on Sunday at the flip and paste the new value into Coolify and into Vercel's Production variable, so the back-out still signs in. |
   | `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_DSN` | public one yes | yes | Sentry → the project → Client Keys, if Vercel has them (the CSP gains Sentry's ingest origin at build time from the public one, `next.config.ts`). |
   | `R2_PUBLIC_IMAGE_BASE`, `TOPDECK_API_KEY`, `LIMITLESS_API_KEY` | no | no | Read by the ingest scripts only, which stay in Actions (§8). Leave them out. |
   | `DB_POOL_MAX` | no | yes | `10` (§7.3). New in this package; Vercel never sets it. |
   | `BETTER_AUTH_URL` | no | Saturday only | `https://next.deckwarden.gg` on staging, so its sign-in returns to staging; deleted on Sunday. |

   `.env.example` is the complete inventory: anything not in this table is a script's switch or set by the platform. Carry values by hand into Coolify, never through the repo, a chat or a session; if you pull Config values with `vercel env pull --environment=production <file>`, keep the file outside the repo and delete it the same hour.
3. **Create the server** in the Hetzner Cloud console: the location from step 1, Ubuntu 24.04, your SSH key, a primary IPv4. Attach a Hetzner Cloud Firewall (it sits outside the box, so Docker's own iptables rules cannot open around it): inbound 22 from your address, 80 and 443 from anywhere, and 8000, 6001, 6002 from your address until the dashboard has its own domain (**Read**, [Coolify's firewall page](https://coolify.io/docs/knowledge-base/server/firewall)). On a 4 GB plan add a 4 GB swap file first (`fallocate -l 4G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile`, and the line in `/etc/fstab`).
4. **Install Coolify** as root: `curl -fsSL https://cdn.coollabs.io/coolify/install.sh | bash` (**Read**, [Coolify's installation page](https://coolify.io/docs/get-started/installation): 2 CPUs and 2 GB for Coolify itself, amd64 or arm64). Open `http://<box-ip>:8000` and create the admin account straight away.
5. **Connect GitHub**: Coolify → Sources → a GitHub App installed on `Bobandis6/deckwarden` only.
6. **Certificates before the flip**: switch Coolify's Traefik to the DNS-01 challenge (**Read**, [Coolify's DNS challenge page](https://coolify.io/docs/knowledge-base/proxy/traefik/dns-challenge)): a Cloudflare API token limited to Zone → DNS → Edit on `deckwarden.gg`; in Servers → the server → Proxy → Configuration add `CF_DNS_API_TOKEN=<token>` to the traefik service's environment, replace the two `httpchallenge` flags with `--certificatesresolvers.letsencrypt.acme.dnschallenge.provider=cloudflare` and `--certificatesresolvers.letsencrypt.acme.dnschallenge.delaybeforecheck=0`, Restart Proxy. With the HTTP challenge, Let's Encrypt can only validate once DNS already points at the box, so the first visitors after the flip would meet Traefik's default certificate. Add nothing about forwarded headers (§7.1).
7. **Create the application**: New Resource → Private Repository (with GitHub App) → `deckwarden`, branch `main`, Build Pack **Dockerfile**, Base Directory `/`, Dockerfile Location `/Dockerfile`, Ports Exposes `3000`. Leave Ports Mappings empty and Container Name unset: either one makes Coolify stop the old container before starting the new one (**Read**, [rolling updates](https://coolify.io/docs/applications/deployments/rolling-updates)). Advanced → Build: Build secrets **Docker BuildKit secrets**, Build arguments **Managed manually in Dockerfile** (otherwise Coolify adds `ARG` lines and passes build arguments, which can appear in image metadata: **Read**, [environment variables](https://coolify.io/docs/applications/configuration/environment-variables), [Dockerfile](https://coolify.io/docs/applications/builds/dockerfile)). Healthcheck: leave the dashboard check off; Coolify uses the image's `HEALTHCHECK` and waits for it before retiring the old container (**Read**, [health checks](https://coolify.io/docs/applications/configuration/health-checks)). Image retention: keep at least 3 (the rollback targets, **Read**, [rollbacks](https://coolify.io/docs/applications/deployments/rollbacks)). Domain: `https://next.deckwarden.gg`. Automatic deploys on push stay on: Vercel keeps deploying `main` all weekend too, so both hosts stay current.
8. **Environment**: the table in step 2 with Saturday's values. Leave both dropdowns at their defaults (available during build, available in the container) for every variable marked Build; the Dockerfile mounts `DATABASE_URL`, the five auth variables and the three `NEXT_PUBLIC_*` names as BuildKit secrets for the build step only.
9. **DNS, a day early**, in Cloudflare → DNS: write down the apex and `www` records exactly as they are (type, content, proxy status, TTL). That note is the back-out. Both are DNS-only today; set their TTL to Auto, which is 300 s for DNS-only records (**Read**, [Cloudflare TTL](https://developers.cloudflare.com/dns/manage-dns-records/reference/ttl/)). Add `next` → A → the box's IPv4, DNS only. No AAAA record for the box, now or on Sunday (§7.1).
10. **Staging sign-in**: register `https://next.deckwarden.gg/api/auth/callback/discord` in the Discord app's OAuth2 redirects and `https://next.deckwarden.gg/api/auth/callback/google` in the Google client's authorized redirect URIs. Friday, because Google's changes can take a while to apply.

## 3. Saturday — staging on the `dev` branch

1. Deploy. Note the build time and the box's memory while it runs (Coolify's server metrics or `free -m` over SSH). An OOM-killed build means more swap, the next plan up, or plan B (§7.7).
2. On `https://next.deckwarden.gg`: `/` answers with the five security headers and the enforcing CSP and no `x-powered-by`; a `/_next/static/…` chunk and `/icon-192.png` answer 200; `/manifest.webmanifest`, `/robots.txt`, `/sitemap.xml` and `/cards/sitemap/1.xml` answer 200; a card page carries `CDN-Cache-Control: public, max-age=3600, stale-while-revalidate=86400`; a card, a hub and a leader preview answer `image/jpeg` with the title in Literata (the serif); `/api/health` answers `{"ok":true,"db":"up"}`; the certificate is Let's Encrypt's.
3. The smokes, from your machine, whose `.env.local` names the same `dev` branch staging reads: `SMOKE_ALLOW_REMOTE=1 BASE_URL=https://next.deckwarden.gg pnpm smoke:hubs`, then `smoke:seo`, `smoke:sets`, `smoke:decks`, `smoke:optcg`, `smoke:combos`. The opt-in is for these runs only (CLAUDE.md). `smoke:seo` fails one line on any production server, "core sitemap lists the public deck": `/sitemap.xml` is ISR with an hour's revalidate (`src/app/sitemap.ts:22`), so it is served from before the smoke's deck existed, and the smoke is written for `next dev` (its header). **Observed** on the Mac, `x-nextjs-cache: HIT`; every other line passes.
4. Sign in on staging with Discord, sign out, sign in with Google, save a deck, sign out.
5. Rollback drill: Coolify → Rollback → the previous image; it turns healthy; roll forward again.
6. Leave it overnight; in the morning check the container's memory and the logs.

## 4. Sunday — production

1. No merges to `main` until the flip is verified: both hosts deploy `main`.
2. In Coolify: `DATABASE_URL` → the production pooled string; delete `BETTER_AUTH_URL` (the origin then defaults to `https://deckwarden.gg`, `src/lib/auth.ts`); add the domains `https://deckwarden.gg` and `https://www.deckwarden.gg`, with the www redirect set the way Vercel has it today (Vercel → the project → Settings → Domains shows which name redirects); keep `next` until Monday. Redeploy. The build now prerenders against production (reads only), and Traefik fetches both certificates through Cloudflare's DNS.
3. Prove it before anyone can reach it, without touching DNS: `curl -sI --resolve deckwarden.gg:443:<box-ip> https://deckwarden.gg/` (the headers, and `curl -v` shows Let's Encrypt), then the same for `/api/health`, a card page and a share page's preview. That is production data served by the box.
4. **The flip, the one step visitors see.** Cloudflare → DNS: the apex → A → the box's IPv4; `www` → the box (A to the IPv4, or CNAME to `deckwarden.gg`); both DNS only; no AAAA. Resolvers follow within the 300 s TTL.
5. On the real name: `/api/health`; a share link pasted in Discord unfurls with the Literata title; sign in with Discord and with Google; save a deck change; Sentry quiet for an hour (the environment reads "production" on both hosts: `VERCEL_ENV` is unset on the box, so Sentry falls back to `NODE_ENV`, `src/instrumentation.ts`); Coolify's logs clean. Visitors who were signed in stay signed in when `BETTER_AUTH_SECRET` is Vercel's value.
6. The nightly needs nothing: it runs in GitHub Actions against Neon and R2 and never knew the host (§8). Monday's green run confirms it.

## 5. The back-out, 48 hours

Vercel stays exactly as it is until Tuesday: the project, both domains attached, Pro active, deploying `main`. Vercel will report the domains' DNS as misconfigured; leave it.

To back out, put the apex and `www` records back to the values written down on Friday. Nothing else changes: both hosts serve the same Neon production database, so no data diverges, and a session is valid on both (one secret, one sessions table). Back out if `/api/health` fails, either sign-in fails, Sentry shows new errors, or the box's p95 or CPU runs out of line with the numbers in §1.

## 6. After the weekend

- Vercel, the owner's steps once the 48 hours pass: remove `deckwarden.gg` and `www` from the project, delete the project, cancel Pro.
- Remove the `next` record, the staging domain in Coolify and the two staging redirect URIs; disable, then delete, the old Google secret if a second one was added.
- Close ports 8000, 6001 and 6002 once the dashboard has a domain of its own (Coolify's firewall page).
- The lines the move edits (§9), then LATER rows 95 (fired), 279, 280 and 283 re-keyed for the box, and row 273 closed.

## 7. Decisions, with their numbers

### 7.1 Which header carries the visitor's address

`clientIp` (`src/lib/decks/access.ts`) takes the first `X-Forwarded-For` element, then `X-Real-Ip`; `decks.created_ip`, the purge policy and every per-address limiter read it, and an address it cannot find falls into one shared `unknown` bucket (`src/lib/rate-limit.ts`).

- **Observed** (Traefik 3.6.25, the line Coolify's proxy runs, in front of an echo server): with Traefik's defaults, a client's own `X-Forwarded-For: 6.6.6.6` and `X-Real-Ip: 7.7.7.7` are dropped, and the app receives both set to the connecting address. With `forwardedHeaders.trustedIPs` covering the sender, Traefik keeps the incoming list and appends the sender, so `6.6.6.6, 9.9.9.9` arrives as `6.6.6.6, 9.9.9.9, 172.18.0.1` and the first element is whatever the client wrote. A client's `CF-Connecting-IP` passes through untouched either way.
- **Read**: Cloudflare's proxy appends to an existing `X-Forwarded-For` and recommends `CF-Connecting-IP`, which holds one address ([Cloudflare](https://developers.cloudflare.com/fundamentals/reference/http-headers/)). Behind Coolify, IPv6 visitors arrive as the Docker network's gateway address (`172.18.0.1`) because Coolify's network has no IPv6 ([coollabsio/coolify#3436](https://github.com/coollabsio/coolify/issues/3436), open, several reporters).
- **Observed** (the container reached directly, nothing in front): Next keeps whatever `X-Forwarded-For` a client sends (a request carrying `203.0.113.7` was counted in that address's limiter bucket) and fills it from the socket when it is absent (`127.0.0.1`). So nothing but Traefik may reach the container: Ports Mappings stays empty (§2 step 7), and the Cloud Firewall admits no port but those in §2 step 3.
- **The rule** (Inferred from both): DNS-only records straight to Traefik with its defaults, and no AAAA record. The first `X-Forwarded-For` element is then the visitor's own IPv4 address and cannot be forged, which is what `clientIp` assumes. Never set `forwardedHeaders.insecure` or `trustedIPs` on this path. An AAAA record would put every IPv6 visitor behind the one gateway address, sharing one bucket in every limiter (the deck preview's 60 a minute between all of them). Turning Cloudflare's proxy on later changes the rule: `clientIp` must read `CF-Connecting-IP` first and the firewall must admit only Cloudflare's ranges on 80 and 443, or anyone can reach the box with a forged header (LATER row 317). IPv6 waits on Coolify (row 319).

### 7.2 Caching the card page and the previews (LATER row 279)

On Vercel the CDN keeps a card page for an hour and serves it stale for a day (`CDN-Cache-Control`, `next.config.ts:17`), and keeps the card, hub and leader previews for a day (`s-maxage`, `src/lib/og/jpeg.ts`). Behind Traefik alone nothing keeps either, so every request renders.

- **Observed** (the Mac, `DB_POOL_MAX=10`, 20 requests each): a card page costs 48 ms of CPU and 9 statements, a card preview 161 ms and 2, a hub preview 155.5 ms, a leader preview 74 ms. The card page's ~1 s on the Mac is its 9 statements at 122 ms each, not CPU. Its browser-facing header is `Cache-Control: private, no-cache, no-store, max-age=0, must-revalidate`, so only a cache that reads `CDN-Cache-Control` would keep it.
- **Inferred**: in Ashburn a statement's round trip is about a millisecond, so a card page costs about its CPU time. At the Mac's speed one card page a second takes 5% of a core, and a crawler fetching ten a second takes half a core for the hour that the 38,192 card URLs (`next.config.ts:13`) last: about 31 CPU-minutes and 344,000 statements in all. One Node process renders on one core, so a container tops out near 20 card pages a second (a CPX core is slower than an M1's; not measured).
- **Read**: Cloudflare caches by file extension and caches neither HTML nor these extensionless routes by default ([default cache behavior](https://developers.cloudflare.com/cache/concepts/default-cache-behavior/)), so its proxy would need a Cache Rule set to Eligible for cache ([Cache Rules](https://developers.cloudflare.com/cache/how-to/cache-rules/settings/)). It reads `CDN-Cache-Control` ahead of `Cache-Control` and passes both on ([Cloudflare, 2021](https://blog.cloudflare.com/cdn-cache-control/)), and `s-maxage` turns its `stale-while-revalidate` off ([Cache-Control](https://developers.cloudflare.com/cache/concepts/cache-control/)), so the previews would keep for a day without the stale window.
- **The choice: no CDN for the move.** The records stay DNS-only, which §7.1's header rule depends on, and the box has the CPU for the numbers above (**Inferred**). If card-page CPU or p95 climbs on the box, or the first crawler sweep there shows in them, the first lever is Cloudflare's proxy with one Cache Rule for `/cards/*` and the preview routes. It needs three things first: `clientIp` reading `CF-Connecting-IP`, the firewall admitting only Cloudflare's ranges on 80 and 443 (§7.1), and Web Analytics' automatic setup off (§7.5). The other lever is ISR for the card page on the box, where writes cost nothing (LATER row 280) and the cache lives on the container's disk, empty after every deploy (**Observed**: the image's `.next` is writable by the `node` user it runs as). LATER rows 317 and 279 carry them.

### 7.3 The database pool

`createDb` opened one connection per process (`max: 1`, `src/db/index.ts`), right for a serverless function instance. One long-lived server answers every concurrent request from one process, so on one connection each request's statements wait behind every other's.

- **Observed** (the Mac, 20 parallel fetches of one card page, five rounds; the hub beside it is served from the ISR cache and stayed at 43–62 ms p95 whatever the pool):

  | `DB_POOL_MAX` | One at a time, p50 | 20 parallel, p50 | 20 parallel, p95 |
  |---|---|---|---|
  | unset (1) | 1,637 ms | 29,373 ms | 31,711 ms |
  | 5 | 1,070 ms | 6,149 ms | 6,724 ms |
  | 10 | 1,041 ms | 3,186 ms | 4,022 ms |

- **Inferred**: twenty card pages are 180 statements, which one connection runs one after another: about 22 s of round trips at the Mac's 122 ms, most of the 29 s above. In Ashburn the round trip shrinks about a hundredfold and the queue with it, but one slow statement would still hold every request behind it.
- **Read** ([Neon](https://neon.com/docs/connect/connection-pooling)): the `-pooler` endpoint in `DATABASE_URL` accepts up to 10,000 client connections in transaction mode, over a pool of 90% of the compute's `max_connections` (104 at 0.25 CU). Ten from the box, beside Vercel's one per function during the back-out window, are far inside that.
- **The change** (this package's only code): `src/db/index.ts` reads `DB_POOL_MAX`, a whole number from 1 to 50 and anything else 1, pinned by `src/db/index.test.ts`. Vercel never sets it, so a function instance keeps its one connection. Set `DB_POOL_MAX=10` on the box.

### 7.4 The health check

- The image's `HEALTHCHECK` fetches `/icon-192.png` every 30 s (every 2 s during the first 30 s after a start): 2,880 probes a day, none of which reaches the database, each a short Node process (**Observed**: about 150 ms of wall time; a fresh container turned healthy 2.3–2.7 s after `docker run`). Coolify uses it in place of its own check (the image has no `curl` or `wget`, which Coolify's own check needs) and waits for it before retiring the old container.
- `/api/health` runs one `select 1` per call. **Read** ([Neon](https://neon.com/faqs/free-plan-limits-and-quotas)): the Free plan gives 100 CU-hours a month per project, a compute suspends after 5 minutes idle and that cannot be turned off, and an exhausted allowance suspends the compute until the next month. **Inferred**: anything that queries the database more often than every 5 minutes keeps the compute awake around the clock, 730 hours × 0.25 CU = 182.5 CU-hours at Neon's example size, so the allowance would run out mid-month and the site with it. Real traffic may already keep it awake (Neon's usage page says); a probe should not be what does.
- So: `/api/health` by hand only. An outside uptime monitor, if one is wanted, polls `/icon-192.png` or a static page such as `/legal`, never `/` (dynamic, it queries) or `/api/health`. Splitting liveness from readiness is LATER row 318.

### 7.5 The analytics beacon

The records stay DNS-only, so Cloudflare cannot inject its beacon and the page carries Cloudflare's snippet (LATER row 313, `src/app/layout.tsx`). If the proxy is ever turned on, keep Web Analytics' automatic setup off for the site, or every page view counts twice.

### 7.6 Sign-in on the new host

Temporary redirect URIs for the staging name on Saturday (§2.10), removed after the weekend. That proves the client ids and secrets typed into Coolify a day before the flip, against the `dev` database; the production URIs never change, and Sunday signs in again on the real name.

### 7.7 Where the image is built

On the box, by Coolify, from `main`. The build needs `DATABASE_URL` (the ISR pages prerender), the five auth variables (`src/lib/auth.ts` refuses to load without them), and HTTPS to the npm registry, to corepack's pnpm download and to Google Fonts (`next/font/google` fetches the faces at build time). Building on the box also builds for the box: a Mac produces arm64 images and Ashburn's CPX boxes are x86, so an image built on the Mac must not be pushed there (or must be built with `--platform linux/amd64`).

- **Observed**: neither the build's `BETTER_AUTH_SECRET` nor its `DATABASE_URL` appears anywhere in the image (`grep -r` over `/app`), nor in `docker history`.
- **Inferred**: Coolify names each BuildKit secret after its variable, which the Dockerfile's mounts expect; its docs do not show the Dockerfile side. Saturday's first build proves it: a build that stops with "BETTER_AUTH_SECRET is not set — see .env.example." got no secrets, and Coolify's build log shows the `--secret` flags it passed.
- **Plan B**, for a box that cannot build (an OOM-killed build, or more than ten minutes): build in GitHub Actions, push to GHCR, and have Coolify deploy the image. It is plan B because Actions would then hold what the build needs: the production `DATABASE_URL` is already an Actions secret (the nightly), but the auth variables are not. They only have to be non-empty at build time (**Observed**: the rehearsal built with placeholders and nothing prerendered reads them), so placeholders would do, at the price of `requireEnv`'s promise that a missing variable fails the build rather than the first request. It also needs a workflow file (pinned SHAs and a `permissions:` block, `src/lib/github-workflows.test.ts`) and a registry token in Coolify. LATER row 316.

### 7.8 The box

- **Observed**: the image's `pnpm build` peaks at ~2.7 GB resident inside a 4 GB cap and ~2.3 GB inside 3 GB, finishing both times, and is OOM-killed after 51 s inside 2 GB (the cloud container, x86). On the Mac the same build peaked at 1.81 GiB across its processes. The running server holds 143 MB idle and 294 MB at the smokes' peak.
- **Read**: Coolify asks for 2 CPUs and 2 GB for itself ([installation](https://coolify.io/docs/get-started/installation)), and it builds on the same box it serves from. Hetzner's US locations sell only the CPX line: CPX11 (2 vCPU, 2 GB) €17.99, CPX21 (3 vCPU, 4 GB) €32.49, CPX31 (4 vCPU, 8 GB) €62.99 a month, excluding VAT ([Hetzner](https://www.hetzner.com/cloud/regular-performance/)). The cheap CX and CAX lines are in Germany and Finland only: a CX33 (4 vCPU, 8 GB) is €8.99 ([Hetzner](https://www.hetzner.com/cloud/cost-optimized/)).
- **Inferred**: Coolify, a build near 2.7 GB and the running site (~0.3 GB) pass 4 GB together on deploy day, so a CPX21 builds only with the 4 GB swap file of §2 step 3, slowly when it swaps; a CPX11 cannot build at all (plan B, §7.7). A CPX31 builds without swap.
- **The cost**: Vercel Pro is $20 a month with $20 of usage included (CLAUDE.md). In Ashburn the box alone is €32.49 or €62.99, so at today's usage the move costs more than staying: it is the exit for a Vercel bill or terms that stop fitting, not a saving. A CX33 in Germany would cost less than Pro but puts the Atlantic between the box and Neon: each of a card page's 9 statements would cross it, on the order of 100 ms a round trip, so a card page would take about the second it takes on the Mac today (**Inferred**). It is cheaper only with Neon moved to Europe too (LATER row 96's question), which moves the latency onto the US visitors instead.

## 8. What does not move

- **Neon**: production and the `dev` branch. The database section of this move is one connection string pasted into Coolify (row 96 keeps the Postgres-on-VPS question with its own trigger).
- **GitHub Actions**: `nightly-ingest.yml` (the six ingests, the One Piece image mirror, the Topdeck archive, the size gauge, the anonymous-deck purge, the backup and its pruning, the ruleset and advisory watches, the keepalive) and `restore-drill.yml`. Nothing in them names the host.
- **Migrations**: `pnpm db:migrate` from your machine (`README.md`), host-free.
- **Cloudflare**: the DNS zone (records DNS-only), R2 and `img.deckwarden.gg`, Web Analytics (the beacon is in the page, `src/app/layout.tsx`).
- **Sentry**, and the **Discord** and **Google** OAuth apps: their production redirect URIs name `https://deckwarden.gg` and stay as they are.
- **Dependabot** and CI (`ci.yml`): `pnpm check` on every push, as today.

## 9. The lines the move edits

- `README.md:22-24`: "…GitHub Actions for the nightly ingest, a Hetzner box running Coolify for hosting (EXIT-RUNBOOK.md)." and keep the standalone sentence.
- `README.md:53-55`: "CI runs the same command on every push to `main`. Coolify on the Hetzner box builds the Dockerfile and deploys from `main`; the nightly workflow runs the ingest jobs against the production database from GitHub Actions."
- `CLAUDE.md`'s stack line ("Vercel Pro (since 2026-10-23)") and its portability paragraph; the build plan's Hosting row (`deckwarden-build-plan.md:53`).
- `next.config.ts:151-154`'s Vercel exception may stay: `VERCEL` is unset on the box, so the box builds standalone either way.
