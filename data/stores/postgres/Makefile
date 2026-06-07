COMPOSE = docker compose -f docker-compose.postgres.yml
PSQL = docker exec -i brain-postgres psql -U brain -d brain -v ON_ERROR_STOP=1

.PHONY: db.up db.migrate db.verify db.reset db.psql db.down

db.up:        ## start local postgres and wait for health
	$(COMPOSE) up -d
	@until [ "$$(docker inspect -f '{{.State.Health.Status}}' brain-postgres 2>/dev/null)" = healthy ]; do sleep 1; done
	@echo "postgres healthy on localhost:5433"

db.migrate:   ## apply schema + seed, enforce phase-1 leakage guard
	PGHOST=localhost PGPORT=5433 PGUSER=brain PGDATABASE=brain PGPASSWORD=brain DEPLOY_PHASE=1 ./migrate.sh

db.verify:    ## re-run leakage guard + list registered tables by phase
	@$(PSQL) -c "SELECT phase, count(*) AS tables FROM brain_meta.schema_tables GROUP BY phase ORDER BY phase;"
	@$(PSQL) -c "SELECT table_schema, count(*) FROM brain_meta.schema_tables GROUP BY 1 ORDER BY 1;"

db.psql:      ## open a psql shell
	$(PSQL)

db.reset:     ## drop everything and re-migrate from scratch
	$(PSQL) -c "DROP SCHEMA IF EXISTS platform, identity, tracking, event_platform, commerce, marketing, integration, logistics, payment, customer, consent, shared, reference, brain_meta CASCADE;"
	$(MAKE) db.migrate

db.down:      ## stop and remove postgres + volume
	$(COMPOSE) down -v
