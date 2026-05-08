# Last Man Standing: Competition Management Guide

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
2. Complete setup checks (especially Stripe if using online payments).
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

### 3.1 Setup Checklist and Stripe Connect
- Use `Setup Checklist` to track readiness.
- Open `Stripe Connect` if using online payments.
- Ensure onboarding and charges/payouts are enabled.

**Screenshot placeholder:**
- `assets/screenshots/admin-setup-checklist-collapsed.png`
- Caption: "Setup summary in collapsed state"

**Screenshot placeholder:**
- `assets/screenshots/admin-stripe-connect-expanded.png`
- Caption: "Stripe Connect expanded with status details"

### 3.2 Create a Competition
- Click `+ New Competition`.
- Set:
  - Name and start date
  - Visibility (`Public` or `Private`)
  - Payment mode (`Free`, `Manual`, `Stripe`)
  - Entry fee / prize pool
  - Missed pick rule
- Save.

**Screenshot placeholder:**
- `assets/screenshots/admin-create-competition-form.png`
- Caption: "Competition creation form"

### 3.3 Choose the Right Payment Mode
- `Free`: no payment tracking.
- `Manual`: admin confirms payments manually.
- `Stripe`: online card payments routed via Stripe Connect.

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
1. Confirm setup readiness (`Setup Checklist`, `Stripe Connect` if needed).
2. Create competition with correct payment and rule settings.
3. Monitor joiners and payment confirmations.
4. Before lock: verify active participants and payment state.
5. After matches: process results and review eliminations.
6. Endgame: declare winner and complete competition.

---

## 5. Troubleshooting

### Problem: Stripe not available as payment mode
- Check Stripe Connect onboarding is complete.
- Check charges and payouts are enabled.
- Refresh Stripe status in Club Admin.

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

### Should we use Manual or Stripe payments?
- Use `Manual` if you collect externally (cash, transfer, Revolut).
- Use `Stripe` for in-app online payments and cleaner audit flow.

### Can we run free competitions and paid ones together?
- Yes. Each competition has its own payment mode.

### Can we export payment data?
- Yes. Use `Actions -> Export CSV` in Participants.

---

## 7. Screenshot Capture Checklist

Create the following screenshots in this order:
1. Player join flow
2. Player pick flow
3. Setup Checklist collapsed summary
4. Stripe Connect expanded details
5. Competition creation form
6. Payment mode selection states
7. Participants mobile toolbar (Search/Filters/Actions)
8. Participant row actions popover
9. Manual payment filters + states
10. Process results action panel

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
