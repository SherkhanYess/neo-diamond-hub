# Neo Diamond Info Center — Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the foundation of the Neo Diamond info center — auth, roles/permissions, reference dictionaries, app shell with role-gated navigation, and the Settings module.

**Architecture:** React 19 + Vite SPA talking to Supabase (Postgres + Auth + RLS). Permissions are a `caps` array on roles enforced by RLS in the DB and mirrored client-side to gate the menu. Reference dictionaries share one generic table shape and one reusable `CrudSection` UI driven by config. Brandbook tokens drive all styling.

**Tech Stack:** React 19, Vite, react-router, @supabase/supabase-js, Vitest + Testing Library, Netlify.

---

## File Structure

```
neo-diamond-hub/
  .env.example
  netlify.toml
  vite.config.js
  vitest.config.js
  index.html
  package.json
  README.md
  supabase/migrations/
    0001_auth_roles.sql          -- profiles, roles, role_branches, profile_branches
    0002_references.sql          -- cities, branches, client_tasks, demand_sources, lead_sources, funnel_stages
    0003_settings_audit.sql      -- display_settings, audit_log
    0004_rls.sql                 -- helper fns + RLS policies
    0005_seed.sql                -- starter dictionaries, Owner role, display defaults
  src/
    main.jsx
    App.jsx
    styles/tokens.css            -- lifted from neo-diamond-ops
    styles/global.css
    lib/supabaseClient.js
    lib/permissions.js           -- CAPS constant, can(), menu visibility
    lib/api/auth.js
    lib/api/profiles.js
    lib/api/roles.js
    lib/api/references.js         -- generic dictionary CRUD
    lib/api/settings.js
    lib/api/audit.js
    context/SessionContext.jsx    -- current user, profile, caps, branches
    components/
      Shell/AppShell.jsx + .css   -- sidebar + top bar + outlet
      Shell/Sidebar.jsx + .css
      Shell/ProtectedRoute.jsx
      Auth/LoginPage.jsx + .css
      common/ConfirmDialog.jsx
      common/Toast.jsx + ToastProvider
      common/EmptyState.jsx
      common/DataTable.jsx
      Settings/SettingsLayout.jsx + .css
      Settings/CrudSection.jsx     -- config-driven dictionary editor
      Settings/sections/*.js       -- config per simple dictionary
      Settings/Users.jsx
      Settings/Roles.jsx
      Settings/Display.jsx
      Settings/ChangeLog.jsx
      pages/DashboardStub.jsx, PlanningStub.jsx, MarketingStub.jsx, SalesStub.jsx, DecisionsStub.jsx
```

---

## Task 1: Scaffold project

**Files:** Create `package.json`, `vite.config.js`, `vitest.config.js`, `index.html`, `src/main.jsx`, `src/App.jsx`, `src/styles/tokens.css`, `src/styles/global.css`, `src/test/setup.js`, `.env.example`, `.gitignore`.

- [ ] Copy `package.json` deps from neo-diamond-ops; add `react-router-dom`. Scripts: dev/build/preview/test.
- [ ] Copy `vite.config.js`, `vitest.config.js`, `src/test/setup.js`, `tokens.css` from `~/neo-diamond-ops`.
- [ ] `index.html` loads Google Fonts (Unbounded, Manrope, JetBrains Mono) + `/src/main.jsx`.
- [ ] `global.css`: body bg `--paper-050`, base typography from tokens.
- [ ] `.env.example` with `VITE_SUPABASE_URL=` and `VITE_SUPABASE_ANON_KEY=`.
- [ ] `App.jsx`: minimal router with a placeholder route.
- [ ] `npm install`; `npm run dev` boots; commit.

## Task 2: Supabase schema — auth & roles (`0001_auth_roles.sql`)

- [ ] `roles`: id uuid pk, name text, is_system bool default false, caps text[] default '{}', scope_type text check in ('all','branches') default 'all', is_archived bool default false, sort_order int, created_at timestamptz default now().
- [ ] `profiles`: id uuid pk references auth.users on delete cascade, full_name text, role_id uuid references roles, is_active bool default true, created_at.
- [ ] `role_branches`(role_id, branch_id) and `profile_branches`(profile_id, branch_id) — composite PKs. (branch FK added in 0002 after branches exists, or defer FK.)
- [ ] Commit migration file.

## Task 3: Supabase schema — references (`0002_references.sql`)

- [ ] `cities`(id, name, sort_order, is_archived, created_at).
- [ ] `branches`(id, city_id fk cities, name, sort_order, is_archived, created_at).
- [ ] Add FKs from role_branches/profile_branches to branches.
- [ ] `client_tasks`(id, name, segment text, sort_order, is_archived, created_at).
- [ ] `demand_sources`(id, name, default_owner_id uuid null fk profiles, sort_order, is_archived, created_at).
- [ ] `lead_sources`(id, name, crm_value text null, sort_order, is_archived, created_at).
- [ ] `funnel_stages`(id, name, is_qualification bool default false, is_sale bool default false, crm_status_id text null, sort_order, is_archived, created_at).
- [ ] Commit.

## Task 4: Supabase schema — settings & audit (`0003_settings_audit.sql`)

- [ ] `display_settings`: single-row table (id int pk default 1 check id=1), plan_color_low int, plan_color_ok int, plan_color_high int, currency text default 'KZT', week_start int default 1.
- [ ] `audit_log`(id, actor_id uuid, entity text, entity_id uuid null, action text, diff jsonb, created_at).
- [ ] Commit.

## Task 5: RLS + helpers (`0004_rls.sql`)

- [ ] `current_caps()` security definer: returns text[] of caps for auth.uid() via profiles→roles.
- [ ] `current_branch_ids()` security definer: intersection of role_branches and profile_branches (or all branches if scope_type='all' and no profile scope).
- [ ] Enable RLS on all tables.
- [ ] Read policies: authenticated can select all reference/roles/profiles/display rows.
- [ ] Write policies: insert/update/delete on references/roles/profiles/display/audit require `'settings' = any(current_caps())`.
- [ ] Commit.

## Task 6: Seed (`0005_seed.sql`)

- [ ] Insert Owner role: name 'Владелец', is_system true, caps = all six, scope_type 'all'.
- [ ] Insert 6 client_tasks with segments per ТЗ.
- [ ] Insert 6 demand_sources.
- [ ] Insert 7 funnel_stages ordered, mark Квалифицирован is_qualification, Продажа is_sale.
- [ ] Insert display_settings default row.
- [ ] README documents manual first-owner creation (create auth user in Supabase dashboard, then insert profile with Owner role_id).
- [ ] Commit.

## Task 7: supabaseClient + auth API + SessionContext

**Files:** `src/lib/supabaseClient.js`, `src/lib/api/auth.js`, `src/context/SessionContext.jsx` (+ test).

- [ ] supabaseClient: createClient from env (copy pattern from ops).
- [ ] auth.js: `signIn(email,password)`, `signOut()`, `getSession()`, `onAuthChange(cb)`.
- [ ] SessionContext: loads session, fetches profile+role (caps, scope, branches), exposes `{session, profile, caps, branchIds, loading, signOut}`.
- [ ] Test: `can(caps,'settings')` helper drives context consumers (mock supabase).
- [ ] Commit.

## Task 8: permissions.js + tests

**Files:** `src/lib/permissions.js`, `src/lib/permissions.test.js`.

- [ ] `CAPS` constant: view_reports, enter_fact, edit_plan, approve_plan, decisions, settings (with ru labels).
- [ ] `can(caps, cap)` → boolean.
- [ ] `visibleMenuItems(caps)` → array of menu keys (Dashboard/Planning/Marketing/Sales requires view_reports; Decisions requires decisions; Settings requires settings; Dashboard always for logged-in? — require view_reports).
- [ ] Tests for each mapping.
- [ ] Commit.

## Task 9: Login page + ProtectedRoute + shell routing

**Files:** `src/components/Auth/LoginPage.jsx`, `src/components/Shell/ProtectedRoute.jsx`, `src/App.jsx`.

- [ ] LoginPage: email+password form, calls signIn, error in human RU language, brandbook styling (paper bg, ink text, pill button).
- [ ] ProtectedRoute: redirect to /login if no session; render children.
- [ ] App routes: /login public; everything else under ProtectedRoute + AppShell.
- [ ] Commit.

## Task 10: AppShell + Sidebar (collapsible, role-gated, mobile overlay)

**Files:** `src/components/Shell/AppShell.jsx`+css, `Sidebar.jsx`+css.

- [ ] Sidebar: menu items from `visibleMenuItems(caps)`; Settings pinned bottom; profile+signout at very bottom.
- [ ] Burger collapses to icon column; mobile (<=768) opens as overlay.
- [ ] AppShell: sidebar + top bar (page title + empty filter slot) + <Outlet/>.
- [ ] Styling strictly from tokens.
- [ ] Commit.

## Task 11: Common components — Toast, ConfirmDialog, EmptyState, DataTable

**Files:** `src/components/common/*`.

- [ ] ToastProvider + useToast: transient toast with optional "Отменить" action + timeout.
- [ ] ConfirmDialog: modal, confirm/cancel, brandbook sheet radius.
- [ ] EmptyState: icon/title/description/action — used by stubs and empty lists.
- [ ] DataTable: sticky header, sortable columns, right-aligned mono numbers.
- [ ] Commit.

## Task 12: Stub pages for future modules

**Files:** `src/components/pages/*Stub.jsx`.

- [ ] Dashboard/Planning/Marketing/Sales/Decisions stubs render EmptyState "Модуль появится в следующей фазе".
- [ ] Wire routes.
- [ ] Commit.

## Task 13: references API (generic CRUD) + tests

**Files:** `src/lib/api/references.js` (+ test), `src/lib/referenceRules.js` (+ test).

- [ ] `listRef(table, {includeArchived})`, `createRef(table,row)`, `updateRef(table,id,patch)`, `archiveRef(table,id)`, `deleteRef(table,id)`.
- [ ] Each write logs to audit via `logChange`.
- [ ] `referenceRules.js`: `canDelete(entity,id, usageChecker)` — phase 1 usageChecker returns false → only archive allowed; `validateFunnelFlags(stages)` — exactly one qualification & one sale; `validateUniqueName`.
- [ ] Tests for rules.
- [ ] Commit.

## Task 14: Settings layout + CrudSection + simple dictionary sections

**Files:** `src/components/Settings/SettingsLayout.jsx`+css, `CrudSection.jsx`, `sections/*.js`.

- [ ] SettingsLayout: side submenu of sections (only if caps includes settings) + content.
- [ ] CrudSection: config = {table, title, columns, fields, rules}. Renders DataTable + search + add/edit form (modal) + archive/delete with ConfirmDialog + undo toast.
- [ ] Section configs: cities, branches (city select), client_tasks (segment select), demand_sources (owner select), lead_sources, funnel_stages (flags + order, validate exactly-one).
- [ ] Commit.

## Task 15: Settings — Users

**Files:** `src/components/Settings/Users.jsx`, `src/lib/api/profiles.js`.

- [ ] List profiles (name, email, role, active). Invite = create auth user (admin API via edge fn OR document manual + insert profile) — phase 1: create profile row + set role/branches; invite email via Supabase admin done manually, documented.
- [ ] Toggle is_active (disable, not delete). Assign role + branches (profile_branches).
- [ ] Commit.

## Task 16: Settings — Roles & permissions

**Files:** `src/components/Settings/Roles.jsx`, `src/lib/api/roles.js`.

- [ ] Matrix: rows=roles, cols=CAPS checkboxes; scope_type toggle + branch multiselect when 'branches'.
- [ ] Create custom role; system role 'Владелец' not deletable, caps locked.
- [ ] Save writes roles + role_branches + audit.
- [ ] Commit.

## Task 17: Settings — Display + ChangeLog

**Files:** `src/components/Settings/Display.jsx`, `ChangeLog.jsx`, `src/lib/api/settings.js`, `api/audit.js`.

- [ ] Display: edit plan color thresholds, currency, week_start (single row upsert).
- [ ] ChangeLog: read-only audit_log list, filter by entity.
- [ ] Commit.

## Task 18: Netlify + README + final wiring

- [ ] netlify.toml (build command, publish dist, SPA redirect).
- [ ] README: setup, migrations order, first-owner SQL, env vars, Netlify deploy.
- [ ] `npm run test` all green; `npm run build` succeeds.
- [ ] Commit.

---

## Self-Review Notes

- Spec coverage: auth (T7,9), roles/caps (T2,8,16), branches scope (T2,3,15,16), dictionaries + archive rule (T3,13,14), funnel flags validation (T13,14), display settings (T4,17), audit/changelog (T4,13,17), shell + role-gated menu + mobile (T10), stubs/empty states (T12), RLS (T5), seed (T6), brandbook tokens (T1 + all css), Netlify (T18). Covered.
- Placeholder scan: usage-check helper is intentionally a phase-1 stub (returns false) — documented, not a gap.
- Type consistency: `caps` text[] everywhere; `can(caps,cap)`, `visibleMenuItems(caps)`, `current_caps()`, `current_branch_ids()` consistent.
