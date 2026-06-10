# Developer Report — fix-p0-audit-quickwins
Implemented audit P0 quick-wins: (1) CH row policies on brain.orders/payments/ad_spend (+live); (2) NULLIF
fail-closed on 7 nullable-brand RLS policies across 5 schema files (+live for phase-1); (3) fail-closed
signing secrets (`config/secrets.ts`, removed known 'dev' HMAC key, BRAIN_ENV prod signal); (4) CORS allowlist
+ @nestjs/throttler global rate limit. Tests: 25 unit + 15 DB green; CH + PG isolation proven live; BFF boots + 200s.
