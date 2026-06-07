# Brain — Standard NestJS Service Architecture

**Status:** binding. Every TypeScript (NestJS) service in the monorepo follows this exact
internal structure. Reference implementation: [`tools/templates/nestjs-service/`](../tools/templates/nestjs-service).
Scaffolded automatically by `tools/scaffold_repo.sh` (`ts_service`). Companion to
[Brain_Repository_Architecture_v2.md](./Brain_Repository_Architecture_v2.md).

> **Why one shape for 100+ services?** Onboarding cost and review cost dominate at scale.
> When every service has the identical internal layout, an engineer who knows one knows all,
> a reviewer's eyes land in the right place instantly, and tooling (codegen, lint boundaries,
> CI) is uniform. The structure is **fixed across Phase 1 → Phase 6**.

---

## 1. The architecture: DDD + Hexagonal + Clean + CQRS

These four are not competing — they are one coherent model viewed from four angles:

- **DDD** gives us the *vocabulary*: aggregates, value objects, domain events, domain services,
  bounded contexts. The business rules live in `domain/` and nowhere else.
- **Hexagonal (Ports & Adapters)** gives us the *seams*: the application defines **ports**
  (interfaces); the outside world provides **adapters** (implementations). The core is isolated
  from transports and infrastructure.
- **Clean Architecture** gives us the *dependency rule*: source-code dependencies point **inward**,
  toward the domain. Nothing the domain depends on can depend on a framework, a DB, or a transport.
- **CQRS** gives us the *use-case split*: writes (`commands/`) and reads (`queries/`) are separate
  paths — writes go through the aggregate and its invariants; reads can use optimized projections.

## 2. The 8-folder `src/` layout (mandatory)

```
src/
├── api/             # ① INBOUND ADAPTERS (driving side)
│   ├── http/        #    REST controllers — translate HTTP ⇄ use-cases, map domain errors → status codes
│   ├── consumers/   #    Kafka/event consumers — translate messages ⇄ use-cases
│   └── guards/      #    authn/z + tenant (brand) resolution; param decorators
├── application/     # ② USE-CASES (orchestration; depends only on domain + ports)
│   ├── commands/    #    CQRS writes — load aggregate → mutate → persist → publish events
│   ├── queries/     #    CQRS reads — return view DTOs (never the domain entity)
│   ├── ports/       #    OUTBOUND INTERFACES the app owns (repository, event-publisher, clients)
│   └── dto/         #    command/query input + view output shapes
├── domain/          # ③ THE BUSINESS CORE — pure, no framework imports
│   ├── model/       #    aggregates, entities, value objects (own their invariants)
│   ├── events/      #    domain events (past-tense facts)
│   ├── services/    #    domain services (logic spanning entities)
│   └── errors/      #    business-rule errors (transport-agnostic)
├── infrastructure/  # ④ OUTBOUND ADAPTERS — non-DB (implement ports)
│   ├── messaging/   #    Kafka producers / outbox
│   ├── clients/     #    external HTTP/gRPC clients
│   └── secrets/     #    vault / KMS access
├── persistence/     # ⑤ THE DB OUTBOUND ADAPTER (split out from infrastructure — Clean Arch: DB is a detail)
│   ├── repositories/#    implement application ports; the ONLY place SQL lives
│   ├── entities/    #    row shapes + domain↔row mappers
│   └── migrations/  #    references to /data migrations (physical DDL is owned by Data Platform)
├── contracts/       # ⑥ SERVICE-LOCAL CONTRACT SURFACE
│   └── generated/   #    codegen output from /contracts (OpenAPI/Avro/proto) — never hand-edited
├── config/          # ⑦ COMPOSITION + CONFIGURATION
│   ├── env.ts       #    env schema + validation (fail fast at boot)
│   ├── tokens.ts    #    DI tokens for infra providers
│   ├── infrastructure.module.ts  # constructs real clients (pg Pool, kafka Producer)
│   ├── <context>.module.ts       # binds ports → adapters (Dependency Inversion happens here)
│   └── app.module.ts             # assembles the service
└── main.ts          # ⑧ COMPOSITION ROOT — validate config, init OTel, create app, health + graceful shutdown
```

## 3. The dependency rule (the single most important constraint)

```
   ┌─────────────────────────── dependencies point inward ──────────────────────────┐
   │                                                                                  ▼
  api  ───────────▶  application  ───────────▶  domain  ◀───────────  infrastructure
 (http,            (commands, queries,        (model, events,        persistence
  consumers,        ports[interfaces],         services, errors)      (adapters IMPLEMENT
  guards)           dto)                        — pure, no deps        application/ports)
```

- `domain/` imports **nothing** from other layers and **no framework**. It is plain TypeScript.
- `application/` imports only `domain/`. It depends on the *outside world* only through `ports/` (interfaces).
- `api/`, `infrastructure/`, `persistence/` are the outer ring — they import inward and **implement** ports.
- The wiring of port → adapter happens **only** in `config/<context>.module.ts` (NestJS DI). That is the
  one place "which database / which broker" is decided. Swapping either touches no use-case and no domain code.

**Concrete trace (the template's example):**
`POST …/widgets` → `WidgetController` → `CreateWidgetCommand` → `Widget.create()` (raises `WidgetCreated`)
→ `WidgetRepository.save()` (implements `WidgetRepositoryPort`) → `KafkaEventPublisher.publish()`
(implements `EventPublisherPort`). The controller contains no SQL; the command contains no `kafkajs`;
the domain knows neither exists.

## 4. CQRS in practice

| | Command path (write) | Query path (read) |
|---|---|---|
| Folder | `application/commands/` | `application/queries/` |
| Goes through the aggregate? | **Yes** — invariants enforced in `domain/model` | No — may read a projection directly |
| Returns | minimal result (`{ id }`) + raises domain events | a **view DTO** (`application/dto/*.view.ts`) |
| Persistence | `repository.save(aggregate)` | `repository.find*` or a read model |

## 5. Testing layers map to architecture layers

| `test/` dir | Tests what | Needs |
|---|---|---|
| `unit/` | `domain/` aggregates + domain services | nothing — pure, no mocks |
| `contract/` | adapters honor `contracts/` (OpenAPI/Avro) | schema fixtures |
| `integration/` | `persistence/` + `infrastructure/` against real Postgres/Kafka | testcontainers |
| `isolation/` | per-brand RLS / tenant isolation (security veto) | seeded multi-tenant data |
| `e2e/` | `api/` end-to-end through a booted app | running service |

## 6. How every service stays consistent

1. **Scaffold, don't hand-roll.** `tools/scaffold_repo.sh` emits this exact tree for every P1/P2 service;
   later-phase services get the reserved directory + `service.yaml` until their phase begins.
2. **The template is the source of truth.** New service = `cp -r tools/templates/nestjs-service …` + rename.
3. **Contracts are external.** A service never invents wire formats — it consumes generated types from
   `/contracts` (single source of truth, codegen via the `codegen` turbo task) into `src/contracts/generated/`.
4. **Schemas are external.** Physical DDL lives in `/data` (owned by Data Platform); `persistence/migrations/`
   only references it. No service owns another's tables (no shared tables — Blueprint §2.14).
5. **Composition is centralized.** Real clients are constructed only in `config/*.module.ts`. The rest of the
   code receives them via DI tokens and never calls `new Pool()` / `new Kafka()`.

## 7. The Python (FastAPI) analogue

Python AI services (`ai-platform/services/*`) mirror the same layering with Python idioms —
`api/ (routers)`, `application/ (use-cases, ports as Protocols)`, `domain/`, `infrastructure/`,
`persistence/`, `contracts/ (generated pydantic/avro)`, `config/`, `main.py`. The dependency rule
is identical; only the framework changes. See the Python template under `tools/templates/` (scaffolded
by `py_service`).

---

**TL;DR:** one shape, eight folders, dependencies inward, ports in / adapters out, writes and reads split,
domain pure. Learn it once; every service in Brain reads the same.
