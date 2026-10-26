# EasyTripPlanner — Touchpoint Analysis

_Date: 2026-10-26 · Site: https://easytripplanner.pages.dev · Based on the live code (commit `cf6a59b`) and research on group-trip apps._

**Purpose of the site:** a private planner for one group — you, your partner and about 10 friends travelling together (Thai and English speakers). Success means: *everyone joins easily, everyone sees the same up-to-date plan, money is fair and settled, and the app is useful on a phone in the middle of the trip.*

---

## 1. Who touches the site

| Persona | Role in app | What they need most | Typical device |
|---|---|---|---|
| **Organiser** (you) | Trip owner | Build the plan fast, get 10 people in, keep everyone aligned, avoid money arguments | Desktop to plan, phone on the trip |
| **Co-planner** (your partner) | Editor | Add ideas and bookings, edit the plan with you | Desktop + phone |
| **Friend** (×10) | Editor or viewer | Join with no effort, know *where to be and when*, add what they paid, know what they owe | Phone only, often in Thai, sometimes on roaming data |

---

## 2. Journey at a glance

Scores: **5** = great · **3** = works with friction · **1** = broken or missing. Based on what the current code does.

| Stage | Touchpoint | Who | Score | Biggest gap |
|---|---|---|---|---|
| **A. Invite & join** | A1 Invite link sent in LINE | Organiser | 4 | Only the owner can invite; link preview shows no trip info |
| | A2 Friend opens link | Friend | 4 | Good banner, but asks for an email that is never used |
| | A3 Create profile + PIN | Friend | 3 | Can't change name/photo/PIN later |
| **B. Return visits** | B1 Login screen | All | 2 | Everyone on the site sees every profile; no "forgot PIN" |
| | B2 Staying logged in | All | 3 | Logs out after 7 days — mid-trip on a 10-day trip |
| **C. Planning** | C1 Trip list | Organiser | 4 | Can't rename, delete or archive a trip |
| | C2 Create trip | Organiser | 4 | No way to fix dates or details afterwards |
| | C3 Days | Organiser | 3 | Can't delete a day or give a day a title (e.g. "Osaka → Kyoto") |
| | C4 Add / edit activity | Organiser, co-planner | 3 | Long one-page form; no end time; place search is basic |
| | C5 Reorder activities | Organiser | 4 | Times don't follow the new order |
| | C6 Map | All | 4 | Overview is straight lines (by design); good Google hand-off |
| | C7 Files (tickets, vouchers) | All | 2 | Can't delete a file; files aren't linked to an activity |
| | C8 Budget & currency | Organiser | 4 | One currency per trip; no THB ↔ JPY view |
| **D. Group coordination** | D1 Members & roles | Organiser | 4 | Only the owner manages people |
| | D2 Knowing what changed | Friends | **1** | No refresh, no "what's new", no notifications |
| | D3 Deciding together | All | **1** | Voting exists in the database but has no screen |
| **E. Before departure** | E1 Trip info (weather, contacts) | All | 4 | No packing list; no default local emergency numbers |
| | E2 Countdown & reminders | All | 2 | Countdown on the trip card only; no reminders |
| **F. During the trip** | F1 "What's next?" | Friends | **2** | Always opens Day 1; no "today / next stop" view |
| | F2 Navigate | All | 5 | Opens Google Maps with the right travel mode |
| | F3 Check-in | Friends | **1** | Three browser pop-ups in a row |
| | F4 Record an expense on the go | Friends | 3 | Works, but no receipt photo, no quick-add |
| | F5 Weak or no signal | All | **1** | Nothing works offline |
| **G. After the trip** | G1 Settle up | All | **2** | Shows who owes whom, but you can't mark a debt as paid; no PromptPay |
| | G2 Memories & wrap-up | All | 1 | Nothing after the trip ends |
| **Everywhere** | X1 Language | Thai friends | 2 | ~57 texts still English-only |
| | X2 Errors & confirmations | All | 2 | Browser pop-ups (`alert` / `confirm` / `prompt`) |
| | X3 Look & motion | All | 5 | New Fluents theme, animations, dark mode |

**Average today: ~3.0 / 5.** The planning stages are solid; the weak points are the moments that involve **the whole group at once** (D2, D3, G1), **the phone during the trip** (F1, F3, F5) and **getting back in** (B1).

---

## 3. Moments of truth

Five touchpoints decide whether 10 friends keep using the site or fall back to the LINE group chat:

1. **First open of the invite link (A2–A3).** If joining takes more than a minute, people stop. *Today: good, but the email field adds friction.*
2. **Forgetting the PIN (B1).** With 10 people this will happen. *Today: the person is stuck for good — there is no recovery path and no way for you to reset it.*
3. **"Did the plan change?" (D2).** If someone's screen shows an old plan once, trust is gone. *Today: changes by others only appear after a manual reload.*
4. **Standing at the station: "where next?" (F1, F5).** *Today: the friend must find the right day tab, and with no signal nothing loads.*
5. **"Who owes what — and did they pay?" (G1).** Research shows money is the biggest friendship risk on group trips. *Today: the debts never go away, even after people pay.*

---

## 4. Touchpoint details

### A. Invite & join

**A1 — Invite link sent in LINE** · Score 4
- **Now:** Owner opens *Members → Create link → Share link*; on phones the share sheet opens (LINE, WhatsApp). Links last 14 days and can be cancelled (`MembersModal.tsx`, `/api/trips/[id]/invites`).
- **Friction:** Only the owner can create links, so your partner can't invite. When pasted in LINE the preview shows only "Travel Planner" — no trip name or picture (`layout.tsx` has no Open Graph tags), which looks less trustworthy.
- **Opportunity:** Let editors create invite links too. Add a friendly preview image and description for shared links.

**A2 — Friend opens the link** · Score 4
- **Now:** Banner "JThana invited you to JAPAN TRIP" with dates; opens on *New profile* (`LoginView.tsx`).
- **Friction:** The form asks for an **email that is never used** (no login, no recovery, no messages). The *Sign in* tab lists every profile on the site.
- **Opportunity:** Make email optional (or use it for PIN recovery, see B1). Show only the people of *this* trip when arriving from an invite.

**A3 — Create profile + PIN** · Score 3
- **Now:** Name, email, 4-digit PIN; avatar generated from the name; joins the trip automatically.
- **Friction:** **No profile settings at all** — nobody can fix a typo in their name, change the picture or change their PIN (no `PUT /api/users`).
- **Opportunity:** A small *My profile* sheet: name, picture, change PIN.

### B. Return visits

**B1 — Login screen** · Score 2
- **Now:** Grid of every profile on the site, then PIN; 5 wrong PINs lock for 15 minutes.
- **Friction:** As more people join, the grid gets long, and **anyone who opens the site sees everyone's names and faces**. **No "forgot PIN"** — a friend who forgets is locked out permanently unless you edit the database.
- **Opportunity:** (1) Let the trip owner reset a member's PIN from *Members*. (2) Remember the last profile used on this device and show it first. (3) Optionally hide the profile grid behind "type your name".

**B2 — Staying logged in** · Score 3
- **Now:** 7-day session (decision D3).
- **Friction:** On a 10-day trip everyone is logged out in the middle of it — possibly at a station with bad signal.
- **Opportunity:** Renew the session automatically while the person keeps using the site (sliding 7 days), so active users are never logged out.

### C. Planning

**C1 — Trip list** · Score 4 — Pastel cards, countdown, hero numbers. *Gap:* no rename, delete or archive (`/api/trips/[id]` has only GET and PATCH for budget/currency), so test or past trips pile up. → Phase 3.2.

**C2 — Create trip** · Score 4 — Name, destination, dates, currency; days created automatically. *Gap:* wrong dates can't be fixed later. → Phase 3.2.

**C3 — Days** · Score 3 — Day pills with dates, "+" adds a day at the end. *Gaps:* can't delete a day, can't add a day before the start, no day title or notes ("Travel day Osaka → Kyoto", "Free day"). → Phase 3.3 + day titles.

**C4 — Add / edit activity** · Score 3
- **Now:** One sheet with name, time, transport, cost, category, place search (OpenStreetMap), map pin, notes (`Itinerary.tsx`).
- **Friction:** Long form on a phone; only a start time (no end time or duration); booking numbers go into free-text notes; the place search finds fewer places than Google.
- **Opportunity:** Split into "quick add" (name + time + place) and "more details"; add end time; a "booking / confirmation no." field.

**C5 — Reorder** · Score 4 — Drag and drop works and saves. *Gap:* times stay the same, so the list can show 18:00 before 10:00. Offer "re-time in this order" or warn.

**C6 — Map** · Score 4 — Numbered pins, stop panel with real Google map and *Navigate*, real optimise distances. *Gap:* overview is straight lines (labelled). Fine for now.

**C7 — Files** · Score 2
- **Now:** Upload tickets/receipts per trip (20 MB), list, open (`AttachmentsModal.tsx`).
- **Friction:** **No delete** (a wrong upload stays forever); files aren't linked to the activity they belong to (the database supports it, the screen doesn't); no thumbnails.
- **Opportunity:** Delete (uploader or owner), "attach to activity", show the ticket inside the activity card. → Phase 4.5.

**C8 — Budget & currency** · Score 4 — Gauge, per-day chart, categories, shared budget. *Gap:* one currency per trip; Thai friends think in baht while paying in yen. → Show a second currency (e.g. "¥3,000 ≈ ฿700") with a rate the owner sets.

### D. Group coordination

**D1 — Members & roles** · Score 4 — Roles, invite links, remove. *Gap:* only the owner can do anything here.

**D2 — Knowing what changed** · Score **1**
- **Now:** The page only reloads data after *your own* actions. Changes by others appear only when you refresh the browser. No "what's new", no notifications. (No polling or live updates anywhere in the code.)
- **Why it matters:** Research on group-trip apps names "keeping everyone informed about changes" as a core pain point; with 10 people a stale screen leads to real mistakes (wrong meeting time).
- **Opportunity:** (1) Auto-refresh when the tab comes back into view and every ~30 seconds while open. (2) A small "Updated by Mali · 5 min ago" on changed items, and a "What's new" list. (3) Later: optional LINE notification for big changes.

**D3 — Deciding together** · Score **1**
- **Now:** A `votes` table and API exist, but the only screen that used them was the AI ideas card (now hidden). Decisions ("ramen or sushi?") happen in LINE.
- **Opportunity:** An **Ideas board**: anyone adds an idea (place + link), everyone votes 👍/👎, the owner moves the winner into a day. Reuses the existing votes API.

### E. Before departure

**E1 — Trip info** · Score 4 — Real weather for the trip's dates and place; emergency contacts with tap-to-call. *Gaps:* no **packing list**; no default **local emergency numbers** for the destination (e.g. Japan 110 police / 119 ambulance, Thailand 191 / 1669); no "documents to bring" checklist.

**E2 — Countdown & reminders** · Score 2 — Countdown on the trip card only. *Opportunity:* "7 days to go — 3 people haven't added their flight" style nudges; export to phone calendar. → Phase 4.3.

### F. During the trip

**F1 — "What's next?"** · Score **2**
- **Now:** The itinerary always opens on **Day 1** (`useState(0)`), even on Day 6 of the trip.
- **Opportunity:** During the trip, open on **today** automatically and highlight the **next activity** ("Next · 14:00 Osaka Castle · 25 min walk · Navigate").

**F2 — Navigate** · Score 5 — One tap opens Google Maps with directions from where you are, using the activity's travel mode. Keep as is.

**F3 — Check-in** · Score **1**
- **Now:** Ticking *Check-in* opens **three browser pop-ups in a row** (arrival time, amount spent, notes) — clumsy on phones and can't be translated.
- **Opportunity:** One small sheet: arrived ✓, amount spent (in trip currency), photo/note. → Phase 3.1.

**F4 — Record an expense on the go** · Score 3 — Full form with equal or custom split. *Gaps:* no receipt photo; no "quick expense" (amount + who paid, split equally by default); everyone must find the Group tab. → A floating "+ Expense" button during the trip.

**F5 — Weak or no signal** · Score **1** — Nothing loads without internet (no offline copy, no installable app). Abroad, roaming and underground stations make this common. → Phase 4.1 (install on phone + read-only offline itinerary). Research: competitors treat offline itinerary as a core feature.

### G. After the trip

**G1 — Settle up** · Score **2**
- **Now:** Clear "A → B ฿X" list and expense history with delete (`ExpenseSplit.tsx`).
- **Friction:** **No way to mark a debt as paid**, so the list never clears and people can't tell who has already paid. No payment details.
- **Opportunity:** "Mark as paid" (records a repayment), and **PromptPay**: each person can add their PromptPay number and the app shows a QR code for the exact amount — very natural for Thai friends.

**G2 — Memories & wrap-up** · Score 1 — Nothing happens after the trip. *Opportunity:* a trip summary (days, places, total spent, per-person cost), shared photo album link, "plan the next trip again" (duplicate).

### X. Everywhere

**X1 — Language** · Score 2 — The EN/TH switch works, but about **57 visible texts are still English-only** (forms, login, members, files, budget labels). For Thai friends the app feels half-translated. → Phase 3.5.

**X2 — Errors & confirmations** · Score 2 — Errors and confirmations use browser pop-ups (`alert`, `confirm`, `prompt`), which look like warnings from the browser, can't be translated, and feel broken on phones. → Phase 3.4.

**X3 — Look & motion** · Score 5 — Fluents pastel theme, count-up numbers, charts, dark mode, reduced-motion respected.

---

## 5. Recommended priorities

How each gap fits the existing plan (`IMPLEMENTATION_PLAN.md`). **New** = not in the plan yet.

| Priority | Touchpoint | Change | In plan? | Size |
|---|---|---|---|---|
| **P0** | B1 | Owner can reset a member's PIN; remember last profile on this device | **New** | S |
| **P0** | D2 | Auto-refresh (on return to tab + every ~30 s) and "updated by / when" | **New** | M |
| **P0** | F3 | Check-in sheet instead of 3 pop-ups | 3.1 | S |
| **P0** | X1 | Full Thai translation | 3.5 | M |
| **P1** | F1 | Open on today + "Next stop" card during the trip | **New** | S |
| **P1** | G1 | Mark debts as paid; PromptPay QR for each person | **New** | M |
| **P1** | C1–C3 | Rename/delete trip, edit dates, delete day, day titles | 3.2, 3.3 (+titles) | M |
| **P1** | X2 | In-app messages and confirm dialogs | 3.4 | S |
| **P1** | A3 | My profile: name, picture, change PIN | **New** | S |
| **P1** | B2 | Sliding session (active users never logged out mid-trip) | **New** | S |
| **P1** | F5 | Install on phone + offline itinerary | 4.1 | L |
| **P2** | D3 | Ideas board with group voting (reuses votes API) | **New** | M |
| **P2** | C7 | Delete files; attach files to activities | 4.5 (+delete) | S |
| **P2** | A1–A2 | Editors can invite; email optional; link preview image | **New** | S |
| **P2** | E1 | Packing list; default local emergency numbers | 4.4 (+numbers) | M |
| **P2** | F4 | Quick-add expense button; receipt photo | **New** | M |
| **P2** | C8 | Second currency view (e.g. JPY ≈ THB) | **New** | S |
| **P3** | G2 | Trip summary, photo album link, duplicate trip | **New** | M |

**Suggested Phase 3 (reshaped):** P0 items first — PIN reset, auto-refresh, check-in sheet, Thai translation — then trip/day editing, in-app messages, "today/next" view and profile settings. Mark-as-paid + PromptPay fits well right before the trip.

---

## 6. What research says about group-trip apps

- Information scattered across chats, screenshots and docs is the main problem these apps solve; group chats are good for talking but bad for keeping decisions findable. ([Smarter Travel](https://www.smartertravel.com/the-apps-that-make-group-trip-planning-work/))
- Common pains: agreeing on an itinerary, **keeping everyone informed about changes**, and the organiser carrying most of the work. ([UX case study — group trip leaders](https://bootcamp.uxdesign.cc/simplifying-the-trip-planning-experience-for-group-trip-leaders-a-product-design-case-study-ffc3e10eb547))
- **Money is a bigger friendship risk than the itinerary**; running balances and settling up matter. ([TripIt — group travel apps](https://www.tripit.com/web/blog/travel-tips/best-group-travel-planning-app))
- The hardest adoption barrier is asking everyone to install another app and create another account. ([Indie Hackers — Tabinote](https://www.indiehackers.com/product/tabinote))
- Leading planners offer real-time collaboration and an offline itinerary. ([WhistleOut — Wanderlog](https://www.whistleout.com/CellPhones/Guides/wanderlog-group-trip-planning-app))

_These sources are mostly product write-ups, so treat them as direction rather than measured data._
