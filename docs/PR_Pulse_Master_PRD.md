# PR Pulse — Master Product Requirements Document
**Version 1.2 · Build-ready · Single source of truth**

> **Scope of this document.** Everything required to build PR Pulse V1 lives here: product intent, data model, module-level detail, business logic, UX rules, and engineering instructions. There is no companion document.
>
> **Timezone.** All date logic — "today", due dates, overdue, follow-ups, reporting periods — is evaluated in **IST (`Asia/Kolkata`)**.

---

## Product Vision

PR Pulse is an internal Relationship Operations Platform built exclusively for **Brand Catapult**. It replaces fragmented spreadsheets and centralizes:

- Influencer Database Management
- Influencer Relationship Memory
- Campaign Execution
- Outreach Tracking
- Deliverables Tracking
- Monthly Reporting

The long-term objective is to preserve institutional knowledge around creators and campaigns so information remains accessible regardless of employee turnover. PR Pulse should feel fast, modern, lightweight, and operationally focused — closer to **Linear, Notion, and Trello** than to a traditional CRM.

## Product Philosophy

PR Pulse is **NOT a CRM. It is an operational workflow platform.** The primary objective is helping campaign teams execute campaigns faster. The system always prioritizes **Speed, Simplicity, Visibility, Actionability** over data collection, administrative complexity, and CRM-style workflows.

Success is achieved when users feel: *"This is easier than using our spreadsheets."*

## Core Product Principles

1. Desktop first
2. Mobile responsive
3. Fast loading
4. Minimal clicks
5. Button-driven workflows
6. Reduce data-entry burden
7. Replace existing Google Sheets
8. No AI features in V1
9. No external API integrations in V1
10. Future-ready for Media Relations
11. Operational tool first
12. Relationship-memory centric

## UI / UX Architecture Principles

**Progressive disclosure.** Users never see all fields at once. Only fields relevant to the current task are visible; secondary information is revealed through modals, side panels, drawers, and expandable sections.

**Primary screen rule.** Every screen has one primary objective. Avoid multiple workflows competing on one screen.

**Data-entry reduction rule.** Prefer dropdowns, status buttons, multi-selects, and quick actions. Avoid large forms, repetitive manual entry, and excessive text fields.

**Engagement screen rule.** The Engagement Record is the most frequently used screen and must remain compact. Secondary workflows (Deliverables, Feedback, Visit Tracking, Activity Timeline) open in drawers or modals. The Engagement screen must never become a long scrolling form.

## Dashboard Philosophy

The Dashboard is an **action center** — operational actions matter more than analytics. Priority order:

1. Follow-ups due
2. Overdue follow-ups
3. Deliverables due
4. Upcoming visits
5. Stalled engagements
6. Campaign health

## Primary Users

**Campaign Manager** — influencer outreach, follow-up management, campaign execution, deliverables tracking, reporting.
**Senior Manager** — campaign oversight, team monitoring, brand oversight, influencer approval.
**Admin** — user management, database administration, platform configuration.

---

## Core Data Architecture

The **Engagement Record** is the central operational object. All workflows revolve around it.

```
Brand 1───* Campaign 1───* Engagement *───1 Contact
                              │
                              ├──* Deliverable
                              └──0..1 Feedback

SavedList *──* Contact        Timeline   (per-engagement, auto-generated)
RegistrationSubmission        AuditLog   (system-wide, admin-only)
        └─(approve)─▶ Contact
```

**Relationship rules**
- One Brand → many Campaigns.
- One Campaign → many Engagements.
- One Contact → many Engagements.
- One Engagement → many Deliverables; one Engagement → at most one Feedback.
- **Unique `(contact_id, campaign_id)` on Engagement** — exactly one engagement per contact per campaign. Re-approaching a previously dropped creator reuses the same record; history is preserved in the Timeline.

**The Contact table is universal.** Do not create a dedicated Influencer table. Contact represents any external relationship; future types (Journalist, Editor, Publication, Producer, Media Contact) are handled by `contact_type` plus future **extension tables**, never by new master tables. V1 is influencer-dominant.

---

# Module 1 — Contact Database

A single universal Contact table backs all relationship records.

### Fields

**Basic information**
- `full_name` *(required)*
- `contact_type` *(required; default Influencer)* — Influencer · Journalist · Editor · Publication · Producer · Media Contact
- `mobile_number` *(required)* — stored normalized to **E.164**; this is the **deduplication key** (see Module 10 and Quick Add)
- `email`
- `city` · `state` · `country`

**Social information**
- `instagram_url` · `youtube_url`
- `other_platform_links` — list of `{label, url}`

**Profile information**
- `primary_category` *(admin-configurable list)*
- `secondary_categories` *(multi-select)*
- `open_to_paid` · `open_to_barter` *(booleans)*

**Commercial information — current indicative rates only**
- `reel_rate` · `story_rate` · `post_rate` · `other_rate`
- These represent **current indicative rates only**. Historical reporting must **never** reference these values. Historical commercials live inside Engagement Records (see Module 5).

**Classification** — Nano · Micro · Mid · Category A · Macro · HNI · F&B Specialist

**Tags** — admin-configurable, many per contact, filterable throughout the platform (e.g. Luxury, Hospitality, Celebrity, Reliable, Delhi, Mumbai, High Conversion, Trending, Alco Bev, Chef, Stylist, Interior, UGC, Parenting, Camellias).

### Profile Status vs. Blacklist (kept separate)

`status` is a **lifecycle** field and has three values only: **Active · Inactive · Archived**.

**Blacklisting is a separate, reversible flag — not a lifecycle stage.** A contact may be blacklisted from any status. Blacklist data is stored as its own record:
- `is_blacklisted` (boolean on contact, default false)
- Blacklist record: `reason` *(required)*, `blacklisted_by`, `blacklisted_at`, and `lifted_by` / `lifted_at` when reversed.

Blacklisting never changes `status`. A profile displays a blacklist banner when an active blacklist record exists. Un-blacklisting is restricted to Senior Manager / Admin.

### Source
Signup Form · Campaign Add · Bulk Upload · Manual Entry · Quick Add.

### Quick Add Contact
Available from Dashboard, Campaign Page, and Contact Database. Fields: `full_name`, `mobile_number`, `instagram_url`, `city` — all others optional. Purpose: capture a creator in **under 15 seconds** without interrupting workflow. **Quick Add runs mobile-number deduplication** (see Module 10) — on a match it warns before creating and offers Cancel or link-to-existing.

### Relationship Memory — Contact Profile

Every Contact Profile is a relationship-memory center and is **globally visible to all internal roles**, including campaigns the viewer is not assigned to, so teams can pick up conversations and negotiate from history. Profiles are **read-first**, edit second.

**Tabs:** Overview · Collaboration History · Active Engagements · Feedback History · Notes.

**Collaboration History (newest first):** Campaign Name · Brand · Collaboration Date · Assigned Manager · Primary Collaboration Reason · Agreed Commercials · Deliverables Completed · Content Quality Rating · Professionalism Rating · Timeliness Rating · Adherence To Terms · Would Work Again · Internal Notes.

**Contact Summary (stored, not recomputed on load — see Performance):** Total Collaborations · Last Collaboration Date · Average Content Quality · Average Professionalism · Average Timeliness · Would-Work-Again %.

---

# Module 2 — Public Creator Registration

Captures creator enquiries from Instagram and other channels. Accessible **without login**.

**Fields:** Full Name · Mobile Number · Email · City · Instagram Link · YouTube Link · Category · Paid Preference · Barter Preference · Reel Rate · Story Rate · Portfolio Links · Notes.

**Workflow:** Submission → New → Pending Review → Approve / Reject → Added to Contact Database.

**Status:** New · Pending Review · Approved · Rejected · Duplicate.

No creator becomes active without approval. **On approval the submission runs mobile-number deduplication**; a match is flagged `Duplicate` (and may be linked to the existing contact). Approved submissions create/link a Contact with `source = Signup Form`.

---

# Module 3 — Brand Management

**Fields:** Brand Name · Brand Category · Logo · Primary Contact · Contact Email · Account Manager · Active Status.

One Brand owns many Campaigns.

---

# Module 4 — Campaign Management

### Campaign Fields
Campaign Name · Brand · Campaign Type · Objective · Start Date · End Date · Campaign Brief · Assigned Managers *(plural — for visibility)* · Status.

### Campaign Status
Draft · Active · Paused · Completed · Archived.

### Collaboration Targets & Health (stored, derived)
Each campaign has `target_collaborations` (nullable; may be 0 in Draft). The system stores and refreshes: `completed_collaborations`, `remaining_collaborations`, `achievement_pct`, `campaign_health`.

```
if target_collaborations is null or target_collaborations == 0:
    achievement_pct = null
    campaign_health = "Not Set"          # neutral; excluded from all Green/Amber/Red rollups
else:
    achievement_pct      = round(100 * completed_collaborations / target_collaborations)
    remaining            = max(0, target_collaborations - completed_collaborations)
    campaign_health      = "Green" if achievement_pct >= 90
                           else "Amber" if achievement_pct >= 70
                           else "Red"
```

There is no division-by-zero path: a campaign with no target shows **Not Set**, never Red and never an error.

### Collaboration Count Logic
A collaboration is counted **only when all three hold**:

1. Engagement `conversation_status == "Collaboration Complete"`, **and**
2. the engagement has **at least one Deliverable**, **and**
3. **every** Deliverable on it has `status == "Posted"`.

The "at least one Deliverable" clause is mandatory — an engagement with zero deliverables can never be counted. Statuses such as Scheduled, In Conversation, No Response, Awaiting Deliverables, and any Dropped status are never counted. Counting is always evaluated live from this rule (see the computed flag `is_counted_collaboration` in Module 5), so reopening an engagement self-corrects the campaign count.

### Saved Creator Lists
Reusable creator groups (e.g. Delhi Foodies, Luxury Influencers, Mumbai Nightlife, High Performing Creators). A creator may belong to multiple lists. Lists are available during campaign population.

---

# Module 5 — Influencer Engagement Tracking

The Engagement Record is the primary operational workspace. Every Contact + Campaign combination creates a single Engagement Record, and all campaign-execution activity is managed through it.

### Fields

**Core**
- `contact` · `campaign` *(unique together)*
- `assigned_manager` — **single owner** of this engagement (drives whose dashboard the follow-up appears on; campaign peers can still see it via the Campaign View)
- `initial_contact_date` · `last_contact_date` · `next_follow_up_date`

**Conversation tracking**
- `conversation_status` · `interest_level` · `notes`

**Commercial tracking (historical — immutable once written)**
- `collaboration_type`
- `agreed_fee`
- `primary_collaboration_reason` *(required)* · `secondary_collaboration_reason` *(optional)*
- Once set, `agreed_fee`, `collaboration_type`, and the deliverable breakdown are never overwritten by later rate changes (see Historical Commercial Tracking).

**Relationship context (displayed, read-only here)**
- Previous brand collaborations · Previous feedback summary · Blacklist status indicator.

**Lifecycle stamp**
- `completed_at` — set the first time the engagement satisfies the count rule (used by monthly reporting; see below).

### Collaboration Reasons
Primary *(mandatory)* and Secondary *(optional)*, each one of: Business · Vitality · Positioning.

### Interest Level
High · Medium · Low · Unknown.

### Conversation Status
Not Contacted · In Conversation · Scheduled · No Response · Dropped – Profile Rejected · Dropped – Not Interested · Dropped – Terms Disagreement · Awaiting Final Deliverables · Collaboration Complete.

### `is_counted_collaboration` (computed)
```
is_counted_collaboration =
    conversation_status == "Collaboration Complete"
    AND deliverable_count >= 1
    AND all deliverables.status == "Posted"
```
**Guard:** the backend rejects setting `conversation_status = "Collaboration Complete"` unless ≥1 deliverable exists and all are Posted; the UI disables the Mark-Complete action until then and explains why. When this flag first becomes true, set `completed_at = now()`.

### Historical Commercial Tracking
Every Engagement Record permanently stores Agreed Fee, Collaboration Type, and Deliverable Breakdown. **Historical reports reference Engagement data, never Contact indicative rates.** Changing a creator's rates updates only the Contact's indicative rates.

### Follow-Up Automation
On `conversation_status` change, the system **suggests** (pre-fills, never silently commits) a `next_follow_up_date`. All suggestions are overrideable.

| New status | Suggested next follow-up |
|---|---|
| In Conversation | today + 3 days |
| No Response | today + 7 days |
| Scheduled | = the visit date captured in the Visit modal (see below) |
| Collaboration Complete | cleared |
| Dropped (any) | cleared |

### Scheduled Visit Tracking
Setting `conversation_status = Scheduled` **opens a required child modal** capturing the visit, so the engagement never silently falls off the dashboard:
- `visit_date` *(required)* · `visit_time` · `outlet` · `visit_notes`

On save, `next_follow_up_date` is set to `visit_date` (overrideable). Visit fields are visible only while status is Scheduled. Visit tracking is operational coordination only — it is **not** a deliverable.

### Engagement Record UX
The Engagement screen stays lightweight.

**Main section (visible immediately):** Contact · Campaign · Assigned Manager · Status · Interest Level · Last Contact Date · Next Follow-up Date · Agreed Fee · Notes.

**Secondary sections open via drawer / modal / side panel:** Visit Tracking *(conditional on Scheduled)* · Deliverables · Feedback · Timeline. **No long scrolling forms.** On mobile, drawers are full-screen sheets, one level deep maximum — a nested action replaces the current sheet with a back affordance rather than stacking.

### Activity Timeline
Every Engagement has an auto-generated Activity Timeline; there is no manual timeline management.
**Fields:** Date · User · Action · Status Change · Notes.
**Indexed by** `(engagement_id, date)` and `(contact_id, date)` (denormalize `contact_id` so the contact-profile feed loads fast). Timeline entries are written in the same transaction as the change that triggers them. The Timeline is engagement-scoped and user-facing; it is distinct from the system-wide Audit Log (Module 11).

---

# Module 6 — Deliverables

Deliverables are child records of an Engagement; one Engagement may have many.

### Deliverable Types
Reel · Story · Static / Carousel Post · Other.

### Fields
- `deliverable_type`
- `quantity` — number of assets on this record (e.g. 3 stories). **Quantity never changes the collaboration count — one engagement equals one collaboration regardless of deliverable quantity.**
- `due_date`
- `status` — Pending · Received · Approved · Posted *(see Overdue below)*
- `published_date`
- `content_link`
- `screenshots` — supporting assets (e.g. three story screenshots on one Story record)
- `brief_compliance` · `brand_tag_verified` · `internal_rating (1–5)`

### Overdue is computed, never stored
There is no "Overdue" status value. Overdue is derived at query time:
```
is_overdue = status != "Posted" AND due_date < (now in IST)::date
```
Dashboards render an Overdue badge from this; no job mutates statuses.

### Story Rule
Stories remain a single Deliverable record with `quantity` and multiple screenshots. Do not create separate records per story.

### Deliverable UX
Managed through compact cards / rows. Managers can change status, upload screenshots, and add content links **inline, without opening a large form.**

### Completion Logic
An engagement is counted as completed only under the rule in Module 5 (`is_counted_collaboration`): status Collaboration Complete **and** ≥1 deliverable **and** all deliverables Posted.

---

# Module 7 — Dashboard

An operational command center: actions before analytics. Avoid excessive charts. Date-relative widgets evaluate against the IST day boundary and read from cached/aggregated values (see Performance).

### Campaign Manager Dashboard
Widgets: Active Campaigns · Follow-ups Due Today · Overdue Follow-ups · Upcoming Visits · Deliverables Due · Deliverables Overdue *(computed)* · Stalled Engagements 7+ / 14+ / 30+ days *(no status change in N days)*.

A follow-up appears on its **owner's** dashboard (the engagement's `assigned_manager`). Campaign peers see the same work through the Campaign View.

**Campaign Target Tracker:** Campaign Name · Target Collaborations · Completed · Remaining · Achievement % · Campaign Health *(Not Set campaigns shown as such, excluded from health rollups)*.

### Senior Manager Dashboard
Widgets: Campaign Overview · Campaign Health · Team Follow-up Performance · Influencer Database Growth · Signup Requests Pending Approval · Team Stalled Engagements · Database Health.

**Database Health:** Total Contacts · New Contacts This Month · Blacklisted Contacts · Archived Contacts · Pending Registrations.

### Dashboard UX Rules
Prioritize, in order: Follow-ups Due → Overdue Follow-ups → Deliverables Due → Upcoming Visits → Stalled Engagements → Campaign Health. Actionable information always wins over charts.

---

# Module 8 — Reporting

Generates client-ready monthly reports directly from campaign data. **Reports are scoped to a reporting period** using engagement `completed_at` and deliverable `published_date`.

### Report Sections
- **Campaign Summary:** Campaign Name · Brand · Reporting Period.
- **Performance Summary:** Target Collaborations · Completed Collaborations.
- **Deliverable Breakdown:** Reels · Stories · Static Posts · Other, with completion counts. Counts are per deliverable record; `quantity` is displayed alongside.
- **Content Gallery:** Screenshots · Content Links.
- **Influencer Summary:** Influencer Name · Deliverables · Collaboration Reason.
- **Campaign Manager Notes:** free text.

### Campaign Assets
Support Screenshot · Content Link · PDF · Drive Link · Other. Assets attach to a Campaign or a Deliverable.

### Export Formats
- **PDF**
- **Shareable Link** — a tokenized URL with a **default 30-day expiry** that is **revocable**. Client-facing reports **strip internal-only fields**: agreed fee, internal ratings, and internal notes are never included. A per-field `client_visible` flag governs inclusion.

---

# Module 9 — Collaboration Feedback

Feedback is created after collaboration completion; one record per engagement. **Feedback is editable**; every create or edit is audit-logged and triggers a refresh of the Contact Summary metrics. (Historical immutability applies to the engagement's agreed fee and deliverable breakdown — not to feedback text and ratings.)

### Fields
Campaign · Contact *(both derived from the engagement)* · Content Quality (1–5) · Professionalism (1–5) · Timeliness (1–5) · Adherence To Collaboration Terms (Yes/No) · Would Work Again (Yes/No) · Internal Notes.

### Feedback History
All feedback appears under **Contact Profile → Feedback History**, so managers can quickly review past collaboration experiences.

### Blacklisting Workflow
Prompt (never automatic) when `would_work_again == No` **or** `adherence_to_terms == No`: *"Would you like to blacklist this creator?"* Blacklisting writes a blacklist record (Reason, User, Date) and sets `is_blacklisted = true`; it does not change `status`. A blacklisted creator is excluded from campaign population by default and shows a warning if force-added; existing engagements remain but display a blacklist banner.

---

# Module 10 — Bulk Import

Supported: Contacts and Campaigns. Format: **CSV**.

**Deduplication** is by **mobile number** and applies consistently across Bulk Import, Quick Add, Manual Entry, and Public Registration approval. On a detected duplicate, warn the user before creation; the user may **Cancel Creation** or **Continue / Review** (link to the existing record).

---

# Module 11 — System Audit Log

Tracks critical system changes; **Admin access only**. Distinct from the per-engagement Timeline.

**Fields:** User · Timestamp · Entity Type · Entity ID · Action Type · Previous Value · New Value.

**Tracked actions:** Contacts (create/update/archive/blacklist) · Campaigns (create/update/status-change) · Engagements (create/status-change/commercial-change) · Deliverables (create/status-change) · Blacklist actions · Feedback edits. Audit records are written in the same transaction as the change.

---

# User Roles & Permissions

| Capability | Campaign Manager | Senior Manager | Admin |
|---|---|---|---|
| View all contacts & full profiles (history, feedback) | ✅ | ✅ | ✅ |
| Add / edit contacts | ✅ | ✅ | ✅ |
| Delete contacts | ❌ | ❌ | ✅ |
| Create / manage campaigns | Assigned only | All | All |
| View engagements | Assigned campaigns (incl. peers' work within them) | All | All |
| Manage outreach & deliverables | Assigned campaigns | All | All |
| Approve creator registrations | ❌ | ✅ | ✅ |
| Manage brands | ❌ | ✅ | ✅ |
| Bulk import | ❌ | ✅ | ✅ |
| Blacklist creator | Trigger prompt only | ✅ | ✅ |
| Un-blacklist creator | ❌ | ✅ | ✅ |
| User management & roles | ❌ | ❌ | ✅ |
| System configuration | ❌ | ❌ | ✅ |
| Audit logs | ❌ | ❌ | ✅ |

Contact profiles are globally readable (relationship memory); engagement *management* is scoped to assigned campaigns.

---

# Technical Architecture

## Design Philosophy
PR Pulse is an operational workflow platform, not a CRM. Prioritize fast record retrieval, simple workflows, minimal clicks, future extensibility, and relationship-memory preservation. The core database must support future Media Relations workflows without redesign.

## Core Entity Architecture
- **Contact** — master relationship record; any external relationship.
- **Brand** — client entity; owns campaigns.
- **Campaign** — operational execution container; owned by a brand; contains many engagements.
- **Engagement Record** — primary operational object (Contact + Campaign); tracks outreach, follow-ups, commercials, collaboration progress.
- **Deliverable** — child of engagement; tracks content requirements, status, publishing, assets.
- **Feedback** — child of engagement; stores collaboration evaluation.
- **Audit Log** — system-generated history of critical changes.

## Universal Contact Architecture
The Contact table remains universal. Do not create separate master tables for influencers, journalists, or editors. Contact-type-specific data goes in **extension tables** (e.g. `influencer_extension`, `journalist_extension`, `editor_extension`), enabling Media Relations expansion without redesigning the database.

## Data Preservation Rules
Historical data is never overwritten. When commercials change, update **Contact indicative rates** only — never the historical Agreed Fee, historical Deliverables, or historical Feedback ratings. Historical campaign records remain immutable. Nothing is hard-deleted except by Admin.

## Contact Lifecycle & Archive
Lifecycle status: **Active → Inactive → Archived** (blacklist is an orthogonal flag, not a lifecycle stage). Archived contacts are hidden from standard searches and campaign population but retained in reporting and collaboration history. **Every list/search query default-scopes to non-archived** unless archived records are explicitly requested.

## Performance Requirements & Optimization
The system stays responsive at 10,000+ contacts, 50,000+ engagements, and 250,000+ timeline entries. These volumes are modest for PostgreSQL; the real risks are summary-metric consistency and N+1 queries, addressed as follows.

**Stored, derived metrics — never computed on page load:**
- **Contact summary** (`total_collaborations`, `last_collaboration_date`, `avg_content_quality`, `avg_professionalism`, `avg_timeliness`, `would_work_again_pct`) is recomputed by `recompute_contact_summary(contact_id)` on feedback create, feedback update, and any engagement reaching `is_counted_collaboration = true`.
- **Campaign metrics** (`completed_collaborations`, `remaining`, `achievement_pct`, `campaign_health`) are recomputed by `recompute_campaign_metrics(campaign_id)`, which **recounts** engagements where `is_counted_collaboration` is true. It runs **in the same transaction** as, and is triggered by, any of: a deliverable created/deleted, a deliverable status change, an engagement status change, or an engagement deletion/move. Because it recounts rather than increments, reopening a completed engagement self-corrects.

**Indexing (minimum):** Engagement `(campaign_id)`, `(contact_id)`, `(assigned_manager, next_follow_up_date)`, unique `(contact_id, campaign_id)`; Deliverable `(engagement_id, status)`, `(due_date)`; Timeline `(engagement_id, date)`, `(contact_id, date)`; Contact `(mobile_number)`, `(status)`, GIN on tags and secondary categories; AuditLog `(entity_type, entity_id, timestamp)`.

**Dashboards** read cached/aggregated values only; a daily IST warmup refreshes date-relative snapshots. Profile and dashboard endpoints batch-load (joins/dataloader) — no per-row fetches.

## Search & Filtering
Contact Database filters fast by: Name · Mobile · City · Category · Tags · Open To Paid · Open To Barter · Classification · Status. Campaign population filters by: Category · City · Platform · Classification · Paid/Barter · Previously Worked With Brand · Blacklist Status (excluded by default) · Tags. All filters are combinable.

## Saved Creator Lists
Reusable creator groups; a creator may belong to many; available during campaign creation.

## Notifications (V1 — dashboard only)
Follow-up Due Today · Overdue Follow-ups · Deliverables Due · Deliverables Overdue · Upcoming Visits. **No email in V1.** Computed against IST boundaries and displayed within the Dashboard.

## Authentication & User Management
**Google Login** only (no password auth). Admin controls user creation, deactivation, and role assignment. Access by role: Campaign Manager → assigned campaigns; Senior Manager → all campaigns + team visibility; Admin → full system access.

## Security Principles
Users access only data appropriate to their role (with contact profiles intentionally global for relationship memory). Historical data is never deleted unintentionally. All major changes remain traceable via the Audit Log.

## Future Media Relations (V2 — do not build, do not preclude)
V2 introduces Journalists, Editors, Publications, Producers, and Coverage Tracking; the universal Contact model supports this via extension tables without redesign. Other potential V2 modules: Media Database, Press-Release Distribution, Coverage Reporting, Publication Relationships, AI Enrichment, Social-Metrics Integrations, Influencer Discovery. No V2 functionality may affect V1 usability.

## Technical Stack & Hosting
- **Frontend:** React + Tailwind CSS
- **Backend:** Node.js (one consistent API layer)
- **Database:** PostgreSQL
- **Auth:** Google Login
- **Hosting:** **shared cloud hosting** (not serverless) — the plan must provide persistent file storage and allow a long-running process, since file uploads cannot be ephemeral
- **File storage:** all uploads route through a `StorageProvider` interface. V1 writes to persistent storage under a non-public path, served via authenticated app routes (never direct filesystem links). The interface allows swapping to an S3-compatible store later without changing call sites.
- **Scheduled jobs:** a single worker for daily IST-boundary cache warmups and notification snapshots.

---

# Non-Negotiable Engineering Instructions

These are mandatory for all (including AI-assisted) development. AI codegen tends to ignore these by default — enforce them mechanically.

1. **Do not build PR Pulse like a CRM.** Avoid Salesforce / HubSpot / Zoho layouts and excessive form screens.
2. **Build a fixed primitive component kit first**, then compose every screen from it: `Drawer`, `Modal`, `SidePanel`, `ExpandableSection`, `StatusButton`, `QuickAction`, `Card`, `DataTable`, `FilterBar`. No screen invents its own form layout. Gate all UI work behind this kit.
3. **Highest UX priority is the Campaign View and the Engagement View** — where Campaign Managers spend most of their time.
4. **Progressive disclosure is mandatory.** Never render all fields at once; secondary workflows open in drawers/modals/expandable sections.
5. **The Engagement Record must remain compact — never a long scrolling form.**
6. **The Dashboard prioritizes actions over analytics.**
7. **Contact Profiles are read-first**, edit second.
8. **Minimize data entry:** dropdowns, buttons, quick actions over typing.
9. **Quick Add must let a user create a contact in under 15 seconds.**
10. **Campaign population = Filter → Select → Add to Campaign.** No multi-step wizard.
11. **The product should feel like Linear / Notion / Trello** and nothing like Salesforce / Zoho / HubSpot.
12. **Guardrails:** enforce a max component size (lint rule); any form exceeding ~8 visible fields must be refactored into progressive-disclosure sections; reject CRM-style layouts in review.

---

# Implementation Sequence (recommended for Cursor)

1. Schema, migrations, and the recompute functions/triggers (entity model + completion/counting + health) — the integrity backbone; build and test these first.
2. Google auth + role/permission middleware.
3. The primitive component kit.
4. Contact Database + Quick Add + dedup; read-first Contact Profile.
5. Brand + Campaign + campaign population.
6. Engagement Record (compact main + drawers).
7. Deliverables (compact cards) + completion guard.
8. Feedback + blacklist workflow.
9. Dashboard (cached widgets).
10. Reporting + PDF/shareable-link export.
11. Bulk import, public registration, audit log, notifications.

---

# Acceptance Tests (must pass before freeze)

- Attempting to mark an engagement Complete with **zero deliverables** is **blocked**.
- A campaign with `target = 0` shows **Not Set** health with **no division error**.
- **Reopening** a completed engagement **decrements** the campaign's completed count automatically.
- Duplicate mobile number triggers a warning on **Quick Add**, **Manual Entry**, **Bulk Import**, and **Registration approval**.
- An **archived** contact is excluded from campaign population and standard search.
- A **blacklisted** contact is excluded from population and warns on force-add; status is unchanged.
- A report **shareable link** excludes agreed fee, internal ratings, and internal notes, and **expires**.
- "Due today" / overdue / follow-up boundaries evaluate correctly at the **IST** day boundary.
- Contact summary and campaign metrics update on the correct write events and are never computed on page load.

---

# Success Criteria

Within 30 days: complete replacement of influencer tracking sheets; full campaign tracking inside PR Pulse; full follow-up visibility; monthly reporting generated in-product; high team adoption due to superior usability.

**Final success metric:** a Campaign Manager can (1) find a creator, (2) add the creator to a campaign, (3) update outreach, (4) track deliverables, and (5) generate a report — **without needing a spreadsheet.** If spreadsheets continue to be used after launch, PR Pulse has failed its primary objective.

*End of PR Pulse Master PRD.*
