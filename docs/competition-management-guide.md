# Last Man Standing: Competition Management Guide

> New comprehensive guide: [How to Use Last Man Standing](how-to-use-app-and-web.md).
>
> This older management guide is kept as a shorter operations reference. Use the comprehensive guide for user and club-admin onboarding.

## Audience
- Players (regular users)
- Club Admins

## What This Guide Covers
- Joining and playing competitions
- Creating and configuring competitions
- Managing participants and payments
- Processing results and handling common issues

---

## 1. Quick Start

### For Players
1. Sign up or log in.
2. Browse or join a competition (code/link/private invite).
3. Make your weekly pick before lock.
4. Track status in Competitions and Survivor Table.

### For Club Admins
1. Open `Club Admin`.
2. Complete setup checks, including manual payment readiness if payments are tracked.
3. Create a competition with correct payment mode and rules.
4. Manage participants and payment confirmations.
5. Process gameweeks and monitor eliminations.

---

## 2. Player Guide

### 2.1 Join a Competition
- Go to `Competitions`.
- Join via public listing, code, or invite link.
- If payment is required, follow competition payment flow.

**Screenshot placeholder:**
- `assets/screenshots/player-join-competition.png`
- Caption: "Join options from the Competitions page"

### 2.2 Make a Pick
- Open the competition.
- Select your team for the current gameweek.
- Confirm before lock time.

### 2.2.1 Lifeline (if enabled by admin)
- Some competitions enable a `Lifeline`.
- You can use it at most once per entry, and only before gameweek lock.
- When enabled for your pick:
  - `Win`: you advance (normal).
  - `Draw`: you advance (lifeline effect).
  - `Loss`: you are eliminated (lifeline does not save a loss).
- Once consumed, your entry cannot use lifeline again.
- Pick history and selections/results screens show when lifeline was used.

**Screenshot placeholder:**
- `assets/screenshots/player-make-pick.png`
- Caption: "Team selection before gameweek lock"

### 2.3 Track Progress
- Use `Competitions` to view active/eliminated status.
- Use `Survivor Table` for overall standings.

**Screenshot placeholder:**
- `assets/screenshots/player-status-overview.png`
- Caption: "Player status and competition progress"

---

## 3. Club Admin Guide

### 3.0 Competition Pricing (First Free, Then Paid)
Each club can create its **first competition for free (one-time, lifetime)**.
Every additional competition requires purchasing a one-time **competition
creation credit** (a flat fee paid to the platform).

How it works:
- **First competition:** created immediately, no charge.
- **Second and beyond:** the club must buy a competition slot before creating.
- **Credits:** one purchase adds one credit; creating one competition consumes
  one credit. Buy multiple in advance if you plan several competitions.

Admin experience:
- The Club Admin dashboard shows either `First competition is free` or your
  current `Slot credits: N`.
- When a purchase is required, a `Buy competition slot` button appears.
- Clicking it opens **Stripe Checkout**; after paying you return to the
  dashboard and a success message confirms the credit was added.
- If checkout is cancelled, no charge is made.

Notes:
- The creation fee is a **software/hosting fee** paid to the platform. It is
  separate from any **player entry fees** (see `Payment Mode` in 3.3).
- Credits do not expire and are tied to the club.

**Screenshot placeholder:**
- `assets/screenshots/admin-billing-buy-slot.png`
- Caption: "Buy competition slot when free competition is used"

### 3.1 Setup Checklist
- Use `Setup Checklist` to track readiness.
- Confirm how manual payments will be collected outside the app if entry fees are used.

**Screenshot placeholder:**
- `assets/screenshots/admin-setup-checklist-collapsed.png`
- Caption: "Setup summary in collapsed state"

### 3.2 Create a Competition
- Click `+ New Competition`.
- Set:
  - Name and start date
  - Visibility (`Public` or `Private`)
  - Payment mode (`Free` or `Manual`)
  - Entry fee / prize pool
  - Missed pick rule
  - Lifeline (`Enabled` or `Disabled`)
- Save.

### 3.2.1 Lifeline Setting (Admin)
- Toggle: `Enable one lifeline per entry (draw survives, loss still eliminates)`.
- Scope: per entry (not shared across all entries by a user).
- Recommended usage:
  - Enable when you want extra strategy and fewer “harsh exits” on draws.
  - Keep disabled for classic strict survivor format.

**Screenshot placeholder:**
- `assets/screenshots/admin-create-competition-form.png`
- Caption: "Competition creation form"

### 3.3 Choose the Right Payment Mode
- `Free`: no payment tracking.
- `Manual`: admin confirms payments manually.

> Note: Payment **mode** controls how *player entry fees* are tracked for a
> single competition. It is separate from the **competition creation fee**
> described in section 3.0, which is what a club pays the platform to create
> additional competitions.

**Screenshot placeholder:**
- `assets/screenshots/admin-payment-mode-options.png`
- Caption: "Payment mode selection and guidance"

### 3.4 Manage Participants
- Open a competition’s `Participants` panel.
- Use mobile toolbar:
  - `Search`
  - `Filters` (participant + payment)
  - `Actions` (add participant, export CSV)
- Use row `Actions` per participant:
  - Confirm/revert payment
  - Declare winner (when appropriate)
  - Remove participant

**Screenshot placeholder:**
- `assets/screenshots/admin-participants-toolbar-mobile.png`
- Caption: "Mobile participants toolbar"

**Screenshot placeholder:**
- `assets/screenshots/admin-participant-row-actions.png`
- Caption: "Per-participant actions menu"

### 3.5 Manage Payments (Manual)
- Filter by payment status (`All/Awaiting/Paid`).
- Confirm payments as funds are received.
- Revert only when needed.

**Screenshot placeholder:**
- `assets/screenshots/admin-manual-payments-state.png`
- Caption: "Manual payment workflow"

### 3.6 Process Gameweek Results
- Open admin results actions for the competition/gameweek.
- Process outcomes to eliminate/advance participants.
- Verify updates in participants and standings.

**Screenshot placeholder:**
- `assets/screenshots/admin-process-results.png`
- Caption: "Processing gameweek outcomes"

---

## 4. Recommended Admin Workflow (Per Competition)
1. Confirm setup readiness (`Setup Checklist`).
2. Create competition with correct payment and rule settings.
3. Monitor joiners and payment confirmations.
4. Before lock: verify active participants and payment state.
5. After matches: process results and review eliminations.
6. Endgame: declare winner and complete competition.

---

## 5. Troubleshooting

### Problem: Participant cannot pick
- In manual mode with strict policy, unpaid users may be blocked.
- Confirm payment or switch policy if intended.

### Problem: Filters feel confusing
- Use `Filters` only for list visibility.
- Use `Actions` for add/export operations.
- Use chips under toolbar to see and clear active filters.

### Problem: Account actions fail with 401
- Re-login and retry.
- Check token/session expiry.
- Confirm protected endpoints are sending bearer token.

---

## 6. FAQ

### Should we use manual payments?
- Use `Manual` if you collect externally (cash, transfer, Revolut).
- Use `Free` when no payment tracking is required.

### Can we run free competitions and paid ones together?
- Yes. Each competition has its own payment mode.

### Why is my first competition free but the next one asks for payment?
- Each club gets one free competition for life.
- Additional competitions require a one-time creation credit purchased via
  Stripe Checkout.
- This creation fee is separate from player entry fees.

### How do we pay to create another competition?
- On the Club Admin dashboard, click `Buy competition slot`.
- Complete Stripe Checkout; you return to the dashboard automatically.
- Once payment is confirmed, your credit is added and you can create the
  competition. Creating it consumes one credit.

### Can we buy several competition slots in advance?
- Yes. Each successful checkout adds one credit; buy as many as you need.
- Credits do not expire and belong to the club.

### The create button is blocked / I got a "payment required" message. Why?
- Your club's free competition has already been used and you have no credits.
- Buy a competition slot, then create the competition.

### How does lifeline work exactly?
- Lifeline must be enabled in competition settings.
- Each entry can use it once, before lock.
- It only changes `DRAW` from elimination to advance.
- It does not protect against `LOSS`.

### Can we export payment data?
- Yes. Use `Actions -> Export CSV` in Participants.

---

## 7. Screenshot Capture Checklist

Create the following screenshots in this order:
1. Player join flow
2. Player pick flow
3. Setup Checklist collapsed summary
4. Competition creation form
5. Payment mode selection states
6. Participants mobile toolbar (Search/Filters/Actions)
7. Participant row actions popover
8. Manual payment filters + states
9. Process results action panel

Tip:
- Capture both mobile and desktop for admin-heavy screens.
- Keep browser zoom at 100% for consistency.
- Use the same seeded demo data to keep captions accurate.

---

## 8. Publishing Notes
- This draft is intended for internal review first.
- After screenshots are added, publish as:
  - `README` section link, and/or
  - Help center page, and/or
  - PDF onboarding pack for club admins.
