# EasyTripPlanner — Implementation Plan

Live site: https://easytripplanner.pages.dev · Repo: MoszThana/Travel-Planner (`main` auto-deploys to Cloudflare Pages)

Review score at the start of this plan: **5.5 / 10** (Look 8 · Ease of use 6 · Usefulness 4 · Safety 2 · Travel use 6).
Target after Phase 4: **8.5+ / 10**.

How we work through it:
- One phase at a time, in order. Inside a phase, tasks can ship one by one.
- Before each task: confirm the open decisions for it. After each task: test locally (`npm run dev`), then commit + push only when you say so, then check the live site.
- Tick the boxes `[x]` as tasks are finished.

---

## Decisions

| # | Question | Decision | Needed before |
|---|---|---|---|
| D1 | Remove the 4 demo profiles (Maru, Somchai, Jane, David) from the live database? | ✅ **Remove** — check what they own first and show you | Task 1.4 |
| D2 | Keep 4-digit PINs, or move to a password (min 8 characters)? | ✅ **Keep 4-digit PIN**, with lockout after 5 wrong tries | Task 1.2 |
| D3 | How long should someone stay logged in on a device? | ✅ **7 days** | Task 1.1 |
| D4 | Share link: build real invite links, or remove the section (the Members screen already adds people)? | ⏳ Open — recommended: remove now, invite links in Phase 4 | Task 2.4 |
| D5 | Expense "suggestions" (editors suggest, owner approves): save them in the database, or let editors record expenses directly? | ⏳ Open — recommended: editors record directly | Task 2.5 |
| D6 | Get a free Gemini API key for the AI features? | ✅ **No key — hide AI features** | Task 2.2 |

---

## Phase 1 — Make it safe (Safety 2 → 8)  ⚠️ do before sharing the link with anyone

Problem today: the server trusts whatever user ID the browser sends; anyone can read/change/delete any trip; `GET /api/trips` without a user returns every trip; 4 demo profiles with PIN `1234` are live; PINs are stored as plain text with no lockout.

- [x] **1.1 Signed login session (cookie)** — `M`
  - On login / profile creation, the server sets an `HttpOnly; Secure; SameSite=Lax` cookie containing the user ID, signed with HMAC-SHA256 (Web Crypto, works on Cloudflare edge). Expires after 7 days (D3).
  - New `src/lib/auth.ts`: `createSession`, `getSessionUser(request)`, `clearSession`.
  - New routes: `POST /api/auth/logout`, `GET /api/auth/me` (replaces trusting `localStorage`).
  - `AuthContext.tsx`: load the user from `/api/auth/me` instead of `localStorage`.
  - **You do:** add secret `SESSION_SECRET` (long random string, I'll generate the command) in Cloudflare Pages → Settings → Variables and Secrets. Local dev reads it from `frontend/.dev.vars` (git-ignored).
- [x] **1.2 Secure PINs + lockout** — `M`
  - Hash PINs with PBKDF2-SHA256 + per-user salt (Web Crypto). Existing plain-text PINs are upgraded automatically the next time that person logs in.
  - Lock a profile for 15 minutes after 5 wrong PINs (new columns `failed_attempts`, `locked_until` on `users`).
  - Remove the "blank PIN = 1234" fallback.
  - DB migration `0002_*` via `npm run db:generate`; apply locally and to live (`db:migrate:remote`).
- [x] **1.3 Every API route checks who is asking** — `L`
  - Helper `requireTripRole(db, tripId, userId, 'viewer' | 'editor' | 'owner')`.
  - Apply to all 21 routes: viewers can read; editors can add/edit activities, days, expenses, contacts, files; only owners manage members.
  - Stop using IDs sent by the browser (`ownerId`, `payerId` default, `uploadedBy`, vote `userId`) — take the user from the session.
  - Remove `GET /api/trips` "return every trip" branch; remove auto-creating fake users in `POST /api/trips`.
  - `PUT /api/activities/[id]`: only allow known fields (no mass assignment).
  - Files (`/api/attachments/[key]`): only trip members can download; drop the 1-year public cache.
- [x] **1.4 Remove demo data** — `S` (after D1) — _2026-10-12: seeding stopped; 4 demo profiles and their "Japan Trip" (owned by demo Maru) deleted from live DB at your request_
  - Stop seeding demo users in `src/db/index.ts`.
  - Remove the 4 demo profiles from the live DB (only after checking what they own).
- [x] **1.5 Profile list shows less personal data** — `S`
  - Login screen: show names + avatars only (no emails) to people who are not logged in.

**Status:** all tasks done and tested locally (49 automated checks). Live DB migrated (`0002`), `SESSION_SECRET` set on Cloudflare. Code not pushed yet.

**Done when:** logged-out requests get `401`; a user cannot open another person's trip (`403`); wrong PIN 5× locks the profile; no demo profiles on live.

---

## Phase 2 — Make fake features real, or hide them (Usefulness 4 → 7)

- [ ] **2.1 Real weather (Open-Meteo, free, no key)** — `M`
  - Find the trip's location: use the first activity with coordinates, otherwise look up the destination name with Open-Meteo geocoding.
  - Show the forecast for the trip's actual dates. If the trip starts more than 16 days away, show "Forecast available from <date>" instead of fake numbers.
  - Remove the hard-coded Tokyo coordinates and the mock weather in `/api/weather`.
- [ ] **2.2 Hide AI features** — `S` (D6 = no key)
  - Hide the AI cost-estimate and nearby-suggestion buttons on activity cards, and the "Ask for ideas" card — no more canned answers like "Local Thai Diner" in Osaka.
  - Keep the rule-based schedule check (overlaps, missing lunch) — it is real logic, not AI — but stop calling Gemini for it.
  - Rename the "AI Assist" tab to something accurate (e.g. "Trip info": weather, emergency contacts).
  - Keep the code path so AI can be switched back on later by adding `GEMINI_API_KEY` (shown only when the key exists).
- [ ] **2.3 Real route optimisation numbers** — `S`
  - Use real distances (haversine, km) for both the current and the suggested order; show the actual saving, or "Already the shortest order".
  - Skip stops without coordinates and say how many were skipped.
- [ ] **2.4 Share link** — `S` (D4) — remove the broken `/trip/...?invite=` link (or replace in 4.6).
- [ ] **2.5 Expense suggestions** — `S` (D5) — remove the queue that disappears on refresh; editors record expenses directly.
- [ ] **2.6 Budget target saved per trip** — `S` — new `budget` column on `trips` (migration), shared by all members instead of one browser.
- [ ] **2.7 Currency per trip** — `M` — new `currency` column (default `THB`, e.g. `JPY` for Japan); format all amounts with `Intl.NumberFormat`; pick currency when creating/editing a trip.
- [ ] **2.8 No more silent "offline saves"** — `S`
  - `Dashboard`, `Itinerary`, `ExpenseSplit`, `AIDrawer`, `MapPlanner` write to `localStorage` when the server fails and pretend it worked (e.g. a fake trip with fake members). Replace with a clear error message. Real offline viewing comes in 4.1.

**Done when:** every number and suggestion shown is real, or the feature is clearly hidden.

---

## Phase 3 — Easier to use (Ease of use 6 → 8)

- [ ] **3.1 Check-in sheet** — `S` — replace the 3 browser pop-ups with one small form (arrival time, amount spent, note).
- [ ] **3.2 Edit / delete trip** — `M` — rename, change destination, dates, currency; delete with confirmation (removes days, activities, expenses, votes, contacts, files incl. R2 objects, in one `db.batch`).
- [ ] **3.3 Delete a day** — `S` — with its activities; renumber remaining days; update trip end date.
- [ ] **3.4 Friendly messages instead of `alert()` / `confirm()`** — `S` — small toast for success/errors, in-app confirm dialog (9 alerts, 2 confirms today).
- [ ] **3.5 Complete Thai translation** — `M` — move ~50 hard-coded English texts (forms, buttons, login, AI, members, files) into `locales/en.json` + `th.json`; use the chosen language for dates and numbers.
- [ ] **3.6 Smaller polish** — `S` — remember last open trip/tab; empty states with a clear next step; loading skeletons instead of "Loading…".

---

## Phase 4 — More useful while travelling (Travel use 6 → 9)

- [ ] **4.1 Install as a phone app + offline itinerary (PWA)** — `L`
  - Web app manifest + icons (from the map-pin icon), "Add to Home Screen".
  - Service worker caches the app and the last-viewed trips so the itinerary opens without signal (read-only offline, clearly labelled).
- [ ] **4.2 Day summary** — `S` — per day: number of stops, first/last time, planned vs. spent, rough travel distance.
- [ ] **4.3 Export** — `M` — add the itinerary to the phone calendar (`.ics` file) and a print-friendly view (Save as PDF from the browser).
- [ ] **4.4 Packing checklist** — `M` — per trip, shared with members (new table `checklist_items`).
- [ ] **4.5 Activity attachments** — `S` — attach tickets/booking PDFs to a specific activity (the DB already supports `activity_id`).
- [ ] **4.6 Invite links** (if D4 = later) — `M` — owner creates a link with a role; the person logs in / creates a profile and joins.

---

## Housekeeping (any time, low risk)

- [ ] Delete the unused `backend/` folder (old Express server) and unused package `@microsoft/microsoft-graph-client`.
- [ ] Replace the default Next.js `frontend/README.md` with how to run, build and deploy.
- [ ] Rename DB column usage: `attachments.onedrive_item_id` now holds the R2 key (rename via migration, or document it).
- [ ] Note for the future: Cloudflare marks `@cloudflare/next-on-pages` as deprecated; it works today. If it ever breaks, move to Cloudflare Workers + OpenNext (the setup we replaced).

---

## Effort guide

`S` ≈ under an hour · `M` ≈ a few hours · `L` ≈ half a day or more (one working session each).

| Phase | Size | Result |
|---|---|---|
| 1 Safety | ~1–2 sessions | Safe to share the link |
| 2 Real features | ~1–2 sessions | Nothing fake left |
| 3 Ease of use | ~1–2 sessions | Smoother everyday use, full Thai |
| 4 Travel | ~2 sessions | Works like an app, offline |
