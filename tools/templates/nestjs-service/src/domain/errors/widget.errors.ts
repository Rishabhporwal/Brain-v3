// DOMAIN ERRORS — business-rule violations, framework-agnostic. The api/ layer maps
// these to HTTP/gRPC status codes; the domain itself knows nothing about transports.
export class DomainError extends Error {
  constructor(public readonly code: string, message: string) { super(message); this.name = new.target.name }
}
export class InvalidWidgetName extends DomainError {
  constructor(name: string) { super('WIDGET_INVALID_NAME', `Invalid widget name: "${name}"`) }
}
export class WidgetAlreadyArchived extends DomainError {
  constructor(id: string) { super('WIDGET_ALREADY_ARCHIVED', `Widget ${id} is already archived`) }
}
export class WidgetNotFound extends DomainError {
  constructor(id: string) { super('WIDGET_NOT_FOUND', `Widget ${id} not found`) }
}
