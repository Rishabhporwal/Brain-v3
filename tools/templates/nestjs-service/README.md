# Brain — Canonical NestJS Service Template

Copy this directory to create a new TypeScript service. Every NestJS service in the
monorepo has **the identical internal shape** — an engineer productive in one is
productive in all. Pattern: **DDD + Hexagonal (Ports & Adapters) + Clean Architecture + CQRS**.

```
cp -r tools/templates/nestjs-service platform/<my-service>
# then: replace SERVICE_NAME → @brain/<my-service>, SERVICE_PATH → platform/<my-service>,
#       OWNING_POD → your pod; rename the `widget` example to your bounded context.
```

## The 8 folders (and the one rule that ties them together)

```
src/
├── api/            inbound adapters — HTTP controllers, kafka consumers, guards. Thin. Maps transport ⇄ use-cases.
├── application/    use-cases — commands/ + queries/ (CQRS), ports/ (interfaces it needs), dto/. Orchestrates; no I/O.
├── domain/         the business core — model/ (aggregates, VOs), events/, services/, errors/. ZERO framework imports.
├── infrastructure/ outbound adapters (non-DB) — messaging/ (kafka), clients/ (http), secrets/. Implements ports.
├── persistence/    the DB outbound adapter — repositories/ (implement ports), entities/ (row mappers), migrations/ (refs).
├── contracts/      generated/ codegen from /contracts (never hand-edit) + this service's published schemas.
├── config/         env schema + DI composition — tokens, infrastructure.module, <context>.module, app.module.
└── main.ts         composition root — validate config, init OTel, create app, health + graceful shutdown, listen.
```

### The dependency rule (enforced by review + lint boundaries)

```
        api ──▶ application ──▶ domain ◀── infrastructure
                     │                ▲          persistence
                     └── ports ◀──────┘ (adapters implement ports)
```

- **Dependencies point inward.** `domain/` depends on nothing. `application/` depends only on `domain/`.
  `api/`, `infrastructure/`, `persistence/` depend on `application/` + `domain/` — never the reverse.
- **Ports & Adapters:** the application declares an interface (`application/ports/*.port.ts`); the outer
  layers provide the implementation (`persistence/repositories/*`, `infrastructure/messaging/*`). They are
  bound together only in `config/<context>.module.ts` (Dependency Inversion via NestJS DI tokens).
- **CQRS:** writes go through `application/commands/` (load aggregate → mutate → persist → publish events);
  reads go through `application/queries/` (may use read-optimized projections, bypassing the aggregate).
- **Domain is pure** → unit tests need no mocks, no I/O (`test/unit/widget.spec.ts`).

## Why each boundary exists (so you don't collapse them)

| Boundary                                    | Protects against                                                                       |
| ------------------------------------------- | -------------------------------------------------------------------------------------- |
| `domain/` has no framework imports          | business rules surviving a framework/ORM/transport swap; trivially testable            |
| `application/ports/` (interfaces)           | the DB/kafka being a _detail_ — swap Postgres or the broker without touching use-cases |
| `persistence/` split from `infrastructure/` | the DB (most-churned adapter) isolated; SQL lives in exactly one place                 |
| `contracts/generated/` is codegen-only      | drift between services — the schema in `/contracts` is the single source of truth      |
| `config/` owns composition                  | wiring in one place; the rest of the code never constructs a client                    |

## The example flow (read it once)

`POST /api/workspaces/:slug/widgets` → `WidgetController` (api) → `CreateWidgetCommand` (application)
→ `Widget.create()` (domain, raises `WidgetCreated`) → `WidgetRepository.save()` (persistence, implements
`WidgetRepositoryPort`) → `KafkaEventPublisher.publish()` (infrastructure, implements `EventPublisherPort`).
The controller knows no SQL; the command knows no kafkajs; the domain knows neither.

See [docs/nestjs-service-template.md](../../../docs/nestjs-service-template.md) for the full rationale and the
Python (FastAPI) analogue.
