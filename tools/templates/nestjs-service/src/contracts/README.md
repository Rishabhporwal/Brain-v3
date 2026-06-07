# contracts/ — service-local contract surface

`generated/` is the **codegen output** from the root `/contracts` (OpenAPI → TS types,
Avro/JSON-Schema → event types, proto → gRPC stubs). Never hand-edit `generated/`.
Run `pnpm codegen` (turbo task) to refresh. This service's *published* API/event schemas
are authored in `/contracts` and owned there (CODEOWNERS), then consumed here.
