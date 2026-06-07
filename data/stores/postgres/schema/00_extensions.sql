-- Brain Aurora schema — extensions. (Conventions: docs Brain_Database_Schema §1)
CREATE EXTENSION IF NOT EXISTS pgcrypto;     -- gen_random_uuid(), digest() for salted hashes
CREATE EXTENSION IF NOT EXISTS pg_trgm;      -- fuzzy search helpers
-- pgvector (vector type) is enabled in the AI/memory phase (P4), not Phase 1.
