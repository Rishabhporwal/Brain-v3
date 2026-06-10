# persistence/migrations/ — references only

Physical DDL is owned by the Data Platform under `/data/stores/postgres` (one owner,
reviewed migrations). This folder holds **service-local references / forward pointers**
to the migrations this service depends on — not the canonical SQL. Schema changes are
PRs against `/data`, co-reviewed by Data Platform (governance rule: no shared tables).
