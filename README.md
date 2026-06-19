# PR Pulse

Internal **Relationship Operations Platform** for Brand Catapult — an operational workflow tool for influencer outreach, campaign execution, deliverables, relationship memory, and monthly reporting. **It is not a CRM.** It should feel like Linear / Notion / Trello.

## Specification set (source of truth)
Place these in `/docs` and treat them as authoritative:
- **`docs/PR_Pulse_Master_PRD.md`** — product intent, modules, data model, business logic, UX rules, engineering instructions.
- **`docs/PR_Pulse_Schema.sql`** — verified PostgreSQL schema: tables, constraints, indexes, and the integrity functions/triggers/views.
- **`docs/PR_Pulse_UX_Spec.md`** — screen-by-screen UX, component kit, user journeys.

If a change conflicts with these docs, update the docs in the same PR (or flag it). Don't let code and spec drift.

## Stack
- **Frontend:** React + Tailwind CSS
- **Backend:** Node.js (one consistent API layer)
- **Database:** PostgreSQL (extensions: `pgcrypto`, `citext`)
- **Auth:** Google OAuth only
- **Hosting:** shared cloud hosting with **persistent file storage** and a long-running process (uploads cannot be ephemeral)
- **Storage:** all uploads go through a `StorageProvider` interface (local persistent volume now; S3-compatible later) — never direct filesystem links

## Non-negotiables (enforced via `.cursor/rules/`)
1. **No long scrolling forms.** Progressive disclosure via drawers/modals; the Engagement Record stays compact.
2. **Build the primitive component kit first**, then compose screens from it.
3. **Database integrity lives in SQL** (triggers/functions/views). Apply it via **raw SQL migrations**; never reimplement it in app code, never let an ORM drop it.
4. **All dates in IST** (`Asia/Kolkata`).
5. Set `app.current_user_id` per write transaction (audit/timeline attribution).
6. Default query scope excludes archived; campaign population excludes blacklisted.
7. Client report exports strip `agreed_fee` / `internal_rating` / `internal_notes`; share links expire + revoke.

## Cursor rules
This repo ships project rules in `.cursor/rules/` (committed to git):
| File | Activation | Scope |
|---|---|---|
| `00-base.mdc` | Always | Project identity + universal non-negotiables |
| `database.mdc` | Auto (db/migration/sql files) | Integrity logic, raw-SQL migrations |
| `ui.mdc` | Auto (component/app/tsx files) | Component kit, progressive disclosure, mirroring DB guards |
| `api-permissions.mdc` | Auto (api/server/route files) | RBAC, query scoping, report field stripping |
| `acceptance.mdc` | Agent-requested | Verification checklist before "done" |

> Rules use the `.mdc` extension with valid YAML frontmatter. A broken frontmatter or a `.md` extension is silently ignored — verify rules appear under **Cursor Settings → Rules**. Do not also add a root `.cursorrules` file (it conflicts with this directory).

## Build order
1. Schema + raw-SQL migrations (functions/triggers/views) — test the completion/counting and health cases first.
2. Google auth + RBAC middleware.
3. Primitive component kit.
4. Contact DB + Quick Add (+ dedup) + read-first Contact Profile.
5. Brand + Campaign + campaign population.
6. Engagement Record (compact main + drawers).
7. Deliverables (compact cards) + completion guard.
8. Feedback + blacklist workflow.
9. Dashboard (cached widgets).
10. Reporting + PDF/shareable-link export.
11. Bulk import, public registration, audit log, notifications.

## Definition of done
A feature is done only when it passes the relevant items in `.cursor/rules/acceptance.mdc`.
