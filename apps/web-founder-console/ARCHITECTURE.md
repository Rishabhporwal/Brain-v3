# web-founder-console — Architecture & Standards

The Brain V2 founder console (Next.js 16 · React 19 · TS · Tailwind 4 · shadcn · TanStack · Recharts).
The legacy app in `legacy frontend/` is the **feature reference only** — every surface is re-shaped to the
structure and quality bar below before it lands here. Aligns with `docs/Brain_Repository_Architecture.md` §6 / §20.

## Target structure

```
app/                         # App Router — THIN pages that render a feature; route groups per surface
  (auth)/                    #   login · sign-up · forgot/update-password · callbacks
  (protected)/
    (workspace)/w/[slug]/…   #   one route per surface → renders features/<surface>
    admin/  account/  onboarding/  invite/
  api/                       # Next route handlers: OAuth callbacks + auth only (BFF edge, not business logic)
  layout.tsx  globals.css
features/                    # FEATURE-SLICED — one folder per bounded-context surface
  <surface>/
    index.tsx                #   the surface component (default export, rendered by the thin page)
    components/              #   surface-local composition
    hooks/                   #   data hooks (useQuery over lib/api)
    api.ts                   #   typed calls for this surface (via lib/api client)
    types.ts                 #   surface DTOs (zod-validated)
    fixtures.ts              #   sample data for frontend-only / Storybook / tests
components/                  # cross-surface composition only
  layout/                    #   app-shell, sidebar, site-header, workspace-switcher, nav-*
  ui/                        #   shadcn primitives (design-system) — NEVER reinvented
lib/
  api/                       # typed BFF client: apiFetch + per-domain clients (contracts-driven later)
  format/                    # currency + INDIAN-NUMBERING formatters  ← mandatory for all money/number
  metrics/                   # metric registry = single source of KPI definitions (parity w/ metric-engine)
  features.ts                # feature-flag + workspace-role gating
  auth/                      # supabase client/server/middleware (isolated → swap to Keycloak later)
  query/                     # TanStack Query client + keys
  utils.ts                   # cn() + small helpers
e2e/                         # Playwright
```

Shared primitives (`format`, `charts`, design-system, `feature-flags`, `bff-client`) graduate to
`apps/packages/*` once the mobile app needs them; until then they live app-local at the paths above with the
same public API, so extraction is a move, not a rewrite.

## Quality bar (every ported surface must pass)

1. **No reinvented primitives** — UI from `components/ui` (shadcn); charts from the shared chart kit; dates via
   `date-fns`; forms via `react-hook-form` + `zod`. Don't hand-roll a button/modal/table.
2. **Currency-aware + Indian numbering** — all money/quantities render through `lib/format` (₹1,23,456 / lakh-crore,
   AED/SAR aware). No inline `toLocaleString`, no hardcoded `₹`/`$`.
3. **Metric-registry-driven** — KPI labels/definitions/formats come from `lib/metrics`, never inlined per page
   (keeps the UI honest against the backend metric engine).
4. **Thin pages → feature components** — `app/**/page.tsx` does routing/params/auth only and renders
   `features/<surface>`. No business logic or data fetching in page files.
5. **Typed, gated data layer** — `lib/api` typed clients; every fetch has loading / empty / error states;
   surfaces gated by `lib/features` (feature key + min role) and scoped by workspace `slug`.
6. **Frontend-only renders** — because there is no backend yet, each surface reads from `fixtures.ts` behind the
   same client interface, so it shows real-looking data now and flips to the live BFF by config later.
7. **TS strict, no `any`** — named exports, Server Components by default, `'use client'` only where needed.
8. **Accessibility (WCAG 2.2 AA)** — keyboard/focus, chart data has a table/aria fallback, RAG status never
   colour-only, reduced-motion respected.

## Legacy → target mapping

| Legacy                                                          | Target                                                               | Change applied                                     |
| --------------------------------------------------------------- | -------------------------------------------------------------------- | -------------------------------------------------- |
| `app/(protected)/w/[slug]/<x>/page.tsx` (logic inline)          | `app/(protected)/(workspace)/w/[slug]/<x>/page.tsx` → `features/<x>` | thin page; logic moves to a feature slice          |
| `components/{analytics,dashboard,goals,timings}/*`              | `features/<surface>/components/*`                                    | co-located with their surface                      |
| `components/ui/*` (shadcn)                                      | `components/ui/*`                                                    | kept (standard primitives), lint-checked           |
| `components/{app-sidebar,nav-*,site-header,workspace-switcher}` | `components/layout/*`                                                | grouped as the app shell                           |
| `lib/api/*`, ad-hoc `fetch`                                     | `lib/api/*` typed clients + `features/*/api.ts`                      | one typed client; bearer/session centralised       |
| inline number/₹ formatting                                      | `lib/format`                                                         | Indian numbering + currency adapter                |
| `lib/metrics/*`, `constants/*`                                  | `lib/metrics` registry                                               | KPI defs centralised                               |
| `hooks/*`, `stores/*`                                           | `features/*/hooks` + `lib/query` + slice stores                      | scoped per surface                                 |
| `lib/{client,server,middleware}.ts` (supabase)                  | `lib/auth/*`                                                         | isolated behind an auth seam (Keycloak-swap-ready) |

## Surfaces to port (≈ the legacy feature set)

Dashboard · Store · Store Analytics · P&L · Waterfall · Products · First-product cascade · Lifetime Value ·
Cohorts · Customer lifecycle · Acquisition · Calendar · Email & SMS · Distributions · Timing · Inventory ·
RTO Analytics · COD vs Prepaid · Pincode Intelligence · Logistics · Shiprocket · Meta Ads · Google Ads ·
Settings (General, Integrations, Backfill, Festivals, Ad-campaigns, Goals, Costs) · Team · Notifications ·
Admin (Users, Workspaces, Sync) · Account · Auth (login/sign-up/reset) · Onboarding · Invite.

## Build order (staged, each slice = its own PR-sized unit)

0. **Foundation** — structure, `lib/format`, `lib/metrics`, `lib/features`, `lib/query`, `lib/api`, app shell
   (layout + sidebar + header + workspace-switcher), providers, auth seam, fixtures harness.
1. **Dashboard** — the exemplar slice (sets the pattern for the rest).
2. Commerce-intelligence surfaces → 3. Customer-intelligence → 4. Channels/Ops → 5. Settings/Admin/Auth/Onboarding.
