# Brain local platform. Phase 1 = databases (postgres + clickhouse) with schema auto-applied.
# App services (compose/services.yml, ai.yml) are layered in as they get images.
COMPOSE = docker compose -f docker-compose.yml -f compose/infra.yml
PG      = docker exec -i brain-local-postgres   psql -U brain -d brain
CH      = docker exec -i brain-local-clickhouse clickhouse-client

WEB   = docker compose -f docker-compose.yml -f compose/infra.yml -f compose/web.yml
PROXY = docker compose -f docker-compose.yml -f compose/infra.yml -f compose/proxy.yml

.PHONY: up down reset logs ps psql ch verify web web.down proxy proxy.down

web:          ## build + run the frontend in Docker (http://localhost:3000)
	$(WEB) up -d --build web
	@echo "✓ Founder Console (Docker): http://localhost:3000"

web.down:     ## stop the frontend container
	$(WEB) rm -sf web

proxy:        ## full stack behind ONE origin (http://localhost:8088): web + bff + keycloak via Caddy
	$(PROXY) up -d --build caddy web bff keycloak
	@echo "✓ Brain (single origin): http://localhost:8088   ·   Keycloak /idp   ·   API /bff"

proxy.down:   ## stop the proxy stack (revert Keycloak to host mode with: make up)
	$(PROXY) rm -sf caddy web bff

up:           ## start the local stack (detached) and wait for the DB to be healthy
	$(COMPOSE) up -d
	@echo "waiting for postgres + clickhouse…"
	@until [ "$$(docker inspect -f '{{.State.Health.Status}}' brain-local-postgres 2>/dev/null)" = healthy ]; do sleep 1; done
	@until [ "$$(docker inspect -f '{{.State.Health.Status}}' brain-local-clickhouse 2>/dev/null)" = healthy ]; do sleep 1; done
	@$(MAKE) -s verify
	@echo "✓ Brain local DB up  —  postgres localhost:5440  ·  clickhouse localhost:8125  (db/user/pass = brain)"
	@echo "  ClickHouse UI (Tabix): http://localhost:5521   (host http://localhost:8125, user default, no password)"
	@echo "  Postgres UI (pgAdmin): http://localhost:5050   (server pre-registered; password = brain)"
	@echo "  Redpanda Console:      http://localhost:8090   (integration data backbone — topic brain.integration.events; broker localhost:19092)"

down:         ## stop the stack (keep data)
	$(COMPOSE) down

reset:        ## wipe volumes and rebuild the schema from scratch
	$(COMPOSE) down -v
	$(MAKE) up

logs:         ## tail infra logs
	$(COMPOSE) logs -f

ps:           ## show stack status
	$(COMPOSE) ps

psql:         ## open a psql shell
	$(PG)

ch:           ## open a clickhouse-client shell
	$(CH)

verify:       ## table counts + Phase-1 leakage guard + clickhouse tables
	@$(PG) -tAc "SELECT 'postgres: '||count(*)||' tables, leak='||coalesce((SELECT string_agg(table_name,',') FROM brain_meta.schema_tables WHERE phase>1),'none') FROM brain_meta.schema_tables"
	@$(CH) -q "SELECT 'clickhouse: '||toString(count())||' tables' FROM system.tables WHERE database='brain'"
