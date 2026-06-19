# PR Pulse — Screen-by-Screen UX Specification
**Version 1.0 · Build-ready · Companion to the Master PRD v1.2 and the Technical Database Schema**

> **How to read this.** Screen numbers map to the PRD module numbers so the three documents form one set. Each screen states **one primary objective**, what lives in the **main view** versus what opens in a **drawer / modal / side panel**, the **components** it is built from, its **states**, and any **role** differences. Field and status names match the schema exactly (e.g. `conversation_status`, `is_counted_collaboration`, `next_follow_up_date`). The four user journeys are folded in at the end as click-paths.
>
> **The non-negotiable:** PR Pulse must feel like Linear / Notion / Trello, never Salesforce / Zoho / HubSpot. If a screen turns into a long scrolling form, it is wrong.

---

## 0. Global UX Foundations

### 0.1 Design language
- **Dense but calm.** Tight vertical rhythm, generous use of whitespace between groups, one accent colour. No card shadows stacked on cards. Borders and subtle background tints over heavy elevation.
- **Speed is a feature.** Optimistic UI on every status change; the row updates instantly and reconciles on the server response. Skeleton loaders, never spinners-on-blank.
- **Keyboard-first where it pays off.** A command palette (`Cmd/Ctrl-K`) for: New Contact, New Campaign, Go to Campaign, Go to Contact, Quick Add. Esc closes the top-most drawer/modal.
- **Buttons over typing.** Status, interest, paid/barter, ratings are all single-tap controls. Free text is reserved for genuine notes.
- **Read-first.** Records render as read views with an explicit **Edit** affordance; they are not forms by default.

### 0.2 Primitive component kit (build this first; compose every screen from it)
| Component | Contract |
|---|---|
| `AppShell` | Left sidebar (Dashboard, Contacts, Campaigns, Brands, Registrations, Reports, Admin) + top bar (search, Quick Add, command palette, profile). Collapses to a bottom tab bar on mobile. |
| `DataTable` | Virtualized rows, server-side sort/filter/paginate, row-click opens detail, multi-select with a sticky action bar. Never renders all columns on mobile — collapses to a two-line cell. |
| `FilterBar` | Combinable filter chips; each chip is a popover. Reflects active filters as removable pills. Drives `DataTable`. |
| `Drawer` | Right-side panel (desktop) / full-screen sheet (mobile). **One level deep maximum** — a nested action replaces the current drawer content with a back affordance, it does not stack a second drawer. |
| `Modal` | Centered, focused, for a single decision or a ≤8-field quick form (Quick Add, Visit, Blacklist confirm). |
| `SidePanel` | Persistent contextual panel (e.g. relationship context on the Engagement screen) that does not overlay content. |
| `ExpandableSection` | In-place disclosure for secondary fields inside a read view. |
| `StatusButton` | Segmented or dropdown control that writes a status enum and fires the associated side-effects (follow-up suggestion, visit modal, completion guard). Shows the optimistic state immediately. |
| `QuickAction` | Icon/label button for one-tap operations (Add Deliverable, Upload Screenshot, Add to Campaign). |
| `Card` | Compact summary unit (deliverable card, campaign tile, dashboard widget). |
| `Pill` / `Tag` | Status colour pills, contact tags. |
| `RatingStars` | 1–5 read/edit control for feedback and internal ratings. |
| `Toast` | Transient success/error; the home for "Follow-up set to 24 Jun", dedup warnings, guard rejections. |
| `EmptyState` | Illustration + one-line explanation + primary action. Every list and drawer has one. |
| `Skeleton` | Shape-matched loading placeholder for tables, cards, profile headers. |
| `ConfirmDialog` | Destructive/irreversible confirmation (archive, blacklist, revoke share link). |

### 0.3 Progressive disclosure rules
1. A screen shows only the fields needed for its primary objective. Everything else is behind a drawer, modal, expandable section, or side panel.
2. Drawers never stack beyond one level. On mobile they are full-screen sheets with a back button.
3. Secondary workflows (Deliverables, Feedback, Visit, Timeline) are drawers off the Engagement Record — never inline sections that lengthen the page.

### 0.4 Global states (every screen implements all four)
- **Loading:** skeletons matched to final layout.
- **Empty:** `EmptyState` with the primary action (e.g. "No engagements yet — Add creators").
- **Error:** inline retry; non-blocking toast for background failures.
- **Permission-denied:** the action simply isn't rendered; if reached directly, a friendly "You don't have access to this campaign" page.

### 0.5 Interaction conventions
- Status changes are optimistic and audited server-side; the Timeline entry and toast appear on success.
- Guard rejections (e.g. completing without Posted deliverables) surface as a toast explaining *why*, with the blocking condition highlighted.
- Dedup warnings are inline (in the Quick Add / import flow), offering **Cancel** or **Continue anyway**.
- Archived and blacklisted records are visually marked (muted row + banner) wherever they legitimately appear.

---

## 1. Contact Database & Quick Add  *(PRD Module 1)*

### 1.1 Contact Database (list)
**Primary objective:** find a creator fast and act on them.

```
┌ AppShell ───────────────────────────────────────────────┐
│ Contacts                         [Quick Add] [+ Contact] │
│ ┌ FilterBar ─────────────────────────────────────────┐  │
│ │ Name  City  Category  Tags  Classification  Paid    │  │
│ │ Barter  Status                         [clear all]  │  │
│ └─────────────────────────────────────────────────────┘ │
│ ┌ DataTable ─────────────────────────────────────────┐  │
│ │ Name        City    Class   Tags        Status  …   │  │
│ │ ▸ Aisha K.  Delhi   Micro   Luxury,UGC  Active      │  │
│ │ ▸ …                                                 │  │
│ └─────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────┘
```
- **Filters (combinable):** Name, Mobile, City, Category, Tags, Open-to-Paid, Open-to-Barter, Classification, Status. Default scope **excludes `archived`**.
- **Blacklisted** contacts show a red pill; **archived** are hidden unless "Include archived" is toggled.
- **Row click → Contact Profile** (1.3). **Multi-select →** sticky bar: Add to Saved List, Add to Campaign.
- **Components:** `FilterBar`, `DataTable`, `Pill`, `EmptyState`.
- **States:** empty → "No contacts match these filters."

### 1.2 Quick Add (modal)  *(target: < 15 seconds)*
**Primary objective:** capture a creator without leaving the current screen.
- Reachable from Dashboard, Campaign page, Contact Database, and the command palette.
- **Fields:** Full Name, Mobile Number, Instagram URL, City. Nothing else.
- **On blur of Mobile**, run dedup (query against `mobile_number`). On match: inline warning *"A contact with this number exists: <name>"* with **Open existing** / **Continue anyway**.
- **Save** options: *Save* and *Save & Add to Campaign…* (opens campaign picker).
- **Components:** `Modal`, `Toast`. **Never** expands into the full contact form.

### 1.3 Contact Profile (read-first, relationship memory)
**Primary objective:** recall everything about a creator before contacting or negotiating.

```
┌ Profile header ──────────────────────────────────────────┐
│ Aisha K.   Micro · Delhi   [Luxury][UGC]      [Edit] [⋯] │
│ ⚑ Blacklisted — "missed deadlines" (if applicable)        │
│ Total: 6 collabs · Last: Apr 2026 · ★4.3 · WWA 83%        │
├ Tabs ────────────────────────────────────────────────────┤
│ Overview | Collaboration History | Active Engagements |   │
│ Feedback History | Notes                                  │
└──────────────────────────────────────────────────────────┘
```
- **Header summary** reads the **stored** metrics (`total_collaborations`, `last_collaboration_date`, the three averages, `would_work_again_pct`) — never computed on load.
- **Globally visible to all roles** (relationship memory). Engagement *editing* from here is still campaign-scoped.
- **Tabs:**
  - **Overview:** contact details, social links, indicative rates *(labelled "current indicative — not historical")*, classification, tags, paid/barter.
  - **Collaboration History:** `DataTable`, newest first — Campaign, Brand, Date, Manager, Primary Reason, Agreed Commercials, Deliverables Completed, the three ratings, Adherence, Would-Work-Again, Internal Notes.
  - **Active Engagements:** open engagements with status + next follow-up; row → Engagement Record.
  - **Feedback History:** all feedback records with `RatingStars`.
  - **Notes:** free text.
- **Edit** flips Overview into an inline edit state (not a separate page). **⋯ menu:** Archive (Confirm), Blacklist (→ blacklist modal), Add to Campaign.
- **Components:** profile header, `Tag`, `RatingStars`, `DataTable`, `ExpandableSection`, `ConfirmDialog`.

---

## 2. Public Registration & Approval Queue  *(PRD Module 2)*

### 2.1 Public form (no login)
**Primary objective:** capture a creator enquiry with zero friction.
- Single-column, mobile-first form (this one is allowed to be a form — it's a public capture, not an operator screen).
- Fields per schema; submit → "Thanks, we'll review your profile." No account is created.

### 2.2 Approval queue (Senior Manager / Admin)
**Primary objective:** clear pending registrations quickly.
- `DataTable` of submissions filtered to `pending_review` / `new`; row → **review `Drawer`**.
- Review drawer shows submitted data and a **dedup result** (auto mobile match) up top. Actions: **Approve** (creates/links a Contact, `source = signup_form`), **Reject**, **Mark Duplicate** (links `linked_contact_id`).
- On Approve, if a mobile match exists, force a choice: link to existing vs create new.
- **Components:** `DataTable`, `Drawer`, `Toast`, `EmptyState` ("Queue is clear 🎉" — the one allowed emoji).

---

## 3. Brand Management  *(PRD Module 3)*  — lightweight
**Primary objective:** maintain the client roster.
- `DataTable` of brands; row → brand `Drawer` with details, logo upload, account manager, active toggle, and a read-only list of the brand's campaigns.
- Senior Manager / Admin only. Keep it minimal; this is reference data, not a workflow.

---

## 4. Campaign View & Population  *(PRD Module 4)*

### 4.1 Campaign View
**Primary objective (one of the two highest-priority screens):** run a campaign — see progress and act on its engagements.

```
┌ Campaign header ─────────────────────────────────────────┐
│ Summer F&B Push   BrandX   Active     [Add Creators] [⋯]  │
│ Target 20 · Completed 14 · Remaining 6 · 70%  ● Amber     │
├ FilterBar (scoped to this campaign's engagements) ───────┤
│ Status  Owner  Interest  Follow-up due                    │
├ DataTable: Engagements ──────────────────────────────────┤
│ Creator     Owner   Status            Next FU   Fee   …   │
│ ▸ Aisha K.  Me      In Conversation   24 Jun    —         │
│ ▸ Rohan T.  Priya   Collaboration ✓   —         ₹40k      │
└──────────────────────────────────────────────────────────┘
```
- **Header tracker** reads stored `completed_collaborations`, `remaining_collaborations`, `achievement_pct`, `campaign_health`. A `not_set` campaign shows "No target set" in neutral grey, never Red.
- **Engagement list:** every Contact+Campaign row; click → Engagement Record. Owner column = `assigned_manager`. Campaign peers see each other's rows (visibility), even though follow-ups surface on the owner's dashboard.
- **Components:** campaign header, `Pill` (health), `FilterBar`, `DataTable`.
- **Roles:** Campaign Managers see only assigned campaigns; Senior/Admin see all.

### 4.2 Campaign Population (Add Creators)
**Primary objective:** add creators with no wizard — **Filter → Select → Add**.
- **Add Creators** opens a right `Drawer`:
```
┌ Drawer: Add Creators ────────────────────────────────────┐
│ ┌ FilterBar ──────────────────────────────────────────┐  │
│ │ Category City Platform Classification Paid/Barter    │  │
│ │ Worked-with-brand  Tags  Saved List ▾                │  │
│ └──────────────────────────────────────────────────────┘ │
│ ┌ DataTable (multi-select) ───────────────────────────┐  │
│ │ ☑ Aisha K.  Delhi  Micro   Luxury                    │  │
│ │ ☐ …                                                  │  │
│ └──────────────────────────────────────────────────────┘ │
│  Blacklisted hidden by default · 3 selected              │
│                       [Quick Add new]   [Add 3 to camp.] │
└──────────────────────────────────────────────────────────┘
```
- **Blacklisted excluded by default**; force-add shows a warning. **Archived never appear.** A **Saved List** can pre-populate selection.
- Adding creates one engagement per contact (`status = not_contacted`, owner = current user by default, editable).
- **Components:** `Drawer`, `FilterBar`, `DataTable`, `QuickAction`, `Toast`.

---

## 5. Engagement Record  *(PRD Module 5)* — the most-used screen

**Primary objective:** advance one creator's outreach. Stays compact; everything secondary is a drawer.

```
┌ Engagement: Aisha K. · Summer F&B Push ──────── [⋯] ─────┐
│ Main (read-first, inline-editable)                        │
│  Status [In Conversation ▾]   Interest [Medium ▾]         │
│  Owner  Priya ▾    Last contact 18 Jun   Next FU 24 Jun   │
│  Agreed fee  ₹—            Reason [Business ▾]            │
│  Notes  ……………………………………………………                    │
│                                                           │
│  [ Deliverables 2 ] [ Feedback ] [ Visit ] [ Timeline ]   │ ← open drawers
├ SidePanel: Relationship context (read-only) ─────────────┤
│  Prev brands: BrandY, BrandZ · ★4.3 · WWA 83%            │
│  ⚑ Not blacklisted                                        │
└──────────────────────────────────────────────────────────┘
```

### 5.1 Main view (visible immediately)
Contact · Campaign · `StatusButton`(conversation_status) · Interest Level · Assigned Manager · Last Contact Date · Next Follow-up Date · Agreed Fee · Notes. That's it — no scrolling.

### 5.2 Status side-effects (driven by `StatusButton`)
- **→ In Conversation:** toast-suggests `next_follow_up_date = today + 3` (editable inline).
- **→ No Response:** suggests `today + 7`.
- **→ Scheduled:** **opens a required Visit `Modal`** (Visit Date*, Time, Outlet, Notes). On save, `next_follow_up_date = visit_date`. The status cannot commit until the visit modal is completed (mirrors the DB `ck_visit_when_scheduled`).
- **→ Collaboration Complete:** the control is **disabled until** ≥1 deliverable exists and all are `Posted` (mirrors the completion guard). Hovering the disabled control explains the blocker. On success, clears follow-up and stamps completion.
- **→ Dropped (any):** clears follow-up.

### 5.3 Relationship context `SidePanel` (read-only)
Previous brand collaborations, previous feedback summary, blacklist indicator — surfaced from the contact, not editable here.

### 5.4 Secondary drawers (one level deep)
- **Deliverables** → Screen 6.
- **Feedback** → Screen 9 (available once work is in progress/complete).
- **Visit** → the same modal as the Scheduled side-effect, viewable/editable while Scheduled.
- **Timeline** → auto-generated `DataTable` (Date, User, Action, Status Change, Notes), newest first, virtualized.

### 5.5 Immutability behaviour
While status is **Collaboration Complete**, Agreed Fee and Collaboration Type render **read-only** with a lock icon and tooltip "Reopen to amend." Reopening (a status change, audited) makes them editable again. This mirrors the schema's freeze-while-completed rule.

- **Components:** `StatusButton`, `SidePanel`, `Drawer`, `Modal`, `RatingStars`, `Toast`.
- **Mobile:** main view stacks; the four drawer triggers become a sticky action row; drawers are full-screen sheets.

---

## 6. Deliverables  *(PRD Module 6)* — drawer off the Engagement

**Primary objective:** update deliverable status and attach proof without a form.

```
┌ Drawer: Deliverables (Aisha K.) ─────────── [+ Add] ─────┐
│ ┌ Card ────────────────────────────────────────────────┐ │
│ │ Reel ×1     Due 20 Jun   [Pending ▾]        ⏷         │ │
│ │ ▸ expand: content link, screenshots, brief ✓, tag ✓   │ │
│ └──────────────────────────────────────────────────────┘ │
│ ┌ Card ────────────────────────────────────────────────┐ │
│ │ Story ×3   Due 18 Jun   [Posted ▾]   ⚠ Overdue        │ │
│ │  [📎 3 screenshots]  [+ link]                          │ │
│ └──────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────┘
```
- Each deliverable is a **`Card`** with inline `StatusButton` (Pending · Received · Approved · Posted). **Overdue is a computed badge** (`v_deliverables.is_overdue`), never a status option.
- **Inline quick actions:** change status, upload screenshots, add content link, set brief-compliance / brand-tag / internal rating — all without opening a separate form. Expandable area holds the less-used fields.
- **Story rule in the UI:** one Story card with `quantity` and multiple screenshots; no per-story cards.
- Adding/removing a deliverable or flipping any status re-evaluates the parent engagement's completion (and the campaign tracker) live — the Engagement's Complete control enables/disables accordingly.
- **Components:** `Drawer`, `Card`, `StatusButton`, `QuickAction`, `RatingStars`, `Pill`.

---

## 7. Dashboard  *(PRD Module 7)* — operational command center

**Primary objective:** show what needs action today; actions over analytics.

```
┌ Dashboard (Campaign Manager) ────────────────────────────┐
│ [Follow-ups Due Today 5] [Overdue 2] [Deliverables Due 3]│
│ [Upcoming Visits 1]                                       │
│ ┌ Action list (tabbed by the widgets above) ───────────┐ │
│ │ Aisha K. · Summer Push · In Conversation · due today  │ │
│ │   [Log contact] [Snooze +3d] [Open]                   │ │
│ └──────────────────────────────────────────────────────┘ │
│ Stalled: [7+ 4] [14+ 1] [30+ 0]                           │
│ ┌ Campaign Target Tracker ─────────────────────────────┐ │
│ │ Summer Push  14/20  70% ●Amber   Diwali  3/3  ●Green │ │
│ └──────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────┘
```
- **Widgets are clickable filters**, not charts — tapping "Follow-ups Due Today" filters the action list below. Each row carries inline quick actions (Log contact, Snooze, Open).
- Priority order top-to-bottom: Follow-ups Due → Overdue → Deliverables Due → Upcoming Visits → Stalled → Campaign Health.
- **Stalled** = `now() − last_status_change_at` over 7/14/30 days. **Follow-ups** appear on the **owner's** dashboard.
- **Senior Manager dashboard:** Campaign Overview & Health, Team Follow-up Performance, Database Growth, Pending Registrations, Team Stalled, Database Health (totals/new/blacklisted/archived/pending).
- All widgets read **cached rollups and the views**; no request-path aggregation.
- **Components:** `Card` widgets, `DataTable` action list, `Pill`, `QuickAction`, `Skeleton`.

---

## 8. Reporting  *(PRD Module 8)*

**Primary objective:** produce a client-ready monthly report from campaign data.

```
┌ Report builder ──────────────────────────────────────────┐
│ Campaign [Summer Push ▾]  Period [Jun 2026 ▾]   [Export ▾]│
├ Live preview (sectioned) ────────────────────────────────┤
│ Campaign Summary · Performance (Target/Completed) ·       │
│ Deliverable Breakdown (Reels/Stories/Static/Other) ·      │
│ Content Gallery · Influencer Summary · Manager Notes      │
└──────────────────────────────────────────────────────────┘
```
- **Period filter** drives the data via `completed_at` and deliverable `published_date`.
- **Live preview** mirrors the export. **Manager Notes** is the one editable section.
- **Export ▾:** **PDF** and **Shareable Link**. The link dialog sets **expiry (default 30 days)** and shows a **Revoke** control. A persistent banner reminds the operator the client view **excludes agreed fee, internal ratings, and internal notes** (driven by the `client_visible` flag).
- **Content Gallery** pulls deliverable screenshots/links; **Campaign Assets** can be attached to the campaign or a deliverable.
- **Components:** section preview cards, `Modal` (share settings), `ConfirmDialog` (revoke), `Toast`.

---

## 9. Feedback & Blacklisting  *(PRD Module 9)* — drawer off the Engagement

**Primary objective:** record a collaboration evaluation and decide on future use.
- **Feedback `Drawer`:** three `RatingStars` (Content Quality, Professionalism, Timeliness), Adherence (Yes/No), Would-Work-Again (Yes/No), Internal Notes. Editable; saving refreshes the contact summary.
- **Blacklist prompt:** if Would-Work-Again = No **or** Adherence = No, a `ConfirmDialog` asks *"Blacklist this creator?"* → if yes, **Blacklist `Modal`** captures Reason (required); writes the blacklist record and flips `is_blacklisted` (status unchanged). Never automatic.
- **Components:** `Drawer`, `RatingStars`, `ConfirmDialog`, `Modal`, `Toast`.

---

## 10. User Journeys (click-paths tying the screens together)

**A. Campaign setup**
Sidebar → Campaigns → **+ Campaign** (modal: name, brand, type, dates, target, managers) → Campaign View → **Add Creators** drawer → Filter → Select → **Add to Campaign** → engagements created (`not_contacted`). *No wizard.*

**B. Outreach workflow**
Dashboard → "Follow-ups Due Today" → row **Open** → Engagement Record → `StatusButton` → **In Conversation** (FU +3 suggested) → update Notes → later **Scheduled** → Visit modal (FU = visit date) → after visit, **Awaiting Final Deliverables**.

**C. Deliverable completion**
Engagement Record → **Deliverables** drawer → **+ Add** (Reel ×1, Story ×3) → as content arrives, flip each card to **Posted** + attach screenshots/links → return to main → **Collaboration Complete** now enabled → tap it → completion stamps, campaign tracker increments, Feedback becomes available.

**D. Creator approval**
Sidebar → Registrations → pending row → review **Drawer** (dedup shown) → **Approve** (link-or-create on match) → Contact created (`signup_form`) → appears in Contact Database.

---

## 11. UX Acceptance Checklist (verify before freeze)

- [ ] No operator screen is a long scrolling form; Engagement secondary workflows are drawers, one level deep.
- [ ] Quick Add creates a contact in < 15s and runs the dedup warning.
- [ ] `Collaboration Complete` is disabled until ≥1 deliverable and all Posted; the disabled reason is shown.
- [ ] Setting `Scheduled` forces the Visit modal before the status commits.
- [ ] Agreed Fee / Collaboration Type are read-only while Completed, editable after reopen.
- [ ] Campaign with no target shows "No target set" (neutral), never Red.
- [ ] Overdue renders as a computed badge, never as a status choice.
- [ ] Archived contacts excluded from search/population by default; blacklisted excluded from population with a force-add warning.
- [ ] Follow-ups appear on the owner's dashboard; campaign peers still see the rows in Campaign View.
- [ ] Shareable report link has expiry + revoke and the client view strips fee/internal ratings/internal notes.
- [ ] Every list, drawer, and widget has loading / empty / error states.
- [ ] Mobile: drawers are full-screen sheets; no nested drawer stacking; tables collapse to two-line cells.

*End of PR Pulse Screen-by-Screen UX Specification.*
