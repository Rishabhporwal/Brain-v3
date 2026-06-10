# Product Applications — operator surfaces (Frontend + Mobile pods)

**Live:** `web-founder-console/` — the primary Next.js dashboard (auth via Keycloak,
integrations, ad-spend, onboarding).

**Planned surfaces** (created when work starts; see `docs/Brain_Solution_Architecture.docx` §11):

- `web-admin-console` — internal ops/superadmin
- `web-assistant` — the natural-language assistant surface
- `mobile` — React Native + Expo; Morning Brief is the hero surface
- `packages/*` — shared UI libraries (`design-system`, `charts`, `formatters`,
  `feature-flags`, `bff-client`, `ui-web`, `ui-mobile`) — extract from
  `web-founder-console` when a second app needs them, not before
