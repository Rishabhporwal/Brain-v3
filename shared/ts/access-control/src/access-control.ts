import type { Pool, PoolClient } from 'pg'
import {
  type BrandContext,
  NoBrandAccessError,
  resolveBrandContext,
  withBrandContext,
  withControlPlane,
} from '@brain/tenancy'
import {
  assertNotLastOwner,
  buildMePermissions,
  type MePermissions,
  type PermissionKey,
  roleHasPermission,
} from '@brain/authz'

/** Thrown when an authenticated caller lacks the permission a protected operation requires. Fail closed. */
export class PermissionDeniedError extends Error {
  constructor(permission: string) {
    super(`missing permission: ${permission}`)
    this.name = 'PermissionDeniedError'
  }
}

/**
 * AccessControl — the unified entry point for the four-layer isolation model + fixed-role RBAC.
 * One instance per service, wrapping the service's pg Pool. It is the ONLY place application code needs to
 * touch tenancy + authz; surfaces and services never set GUCs, switch roles, or read the role→permission
 * map directly.
 */
export class AccessControl {
  constructor(private readonly pool: Pool) {}

  /**
   * Resolve the caller's context for a brand from their memberships, or throw NoBrandAccessError (which
   * surfaces should render as 404). Use {@link tryContextFor} when null is the expected, non-exceptional case.
   */
  async contextFor(userId: string, brandSlug: string): Promise<BrandContext> {
    const ctx = await resolveBrandContext(this.pool, userId, brandSlug)
    if (!ctx) throw new NoBrandAccessError(brandSlug)
    return ctx
  }

  /** Like {@link contextFor} but returns null instead of throwing when there's no access. */
  tryContextFor(userId: string, brandSlug: string): Promise<BrandContext | null> {
    return resolveBrandContext(this.pool, userId, brandSlug)
  }

  /** Run tenant-data queries with RLS active for the context's brand (Layer 1+2). */
  runInBrand<T>(ctx: BrandContext, fn: (client: PoolClient) => Promise<T>): Promise<T> {
    return withBrandContext(this.pool, { brandId: ctx.brandId, organizationId: ctx.organizationId }, fn)
  }

  /** Run cross-brand identity/membership (control-plane) queries; caller MUST scope by user_id. */
  controlPlane<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
    return withControlPlane(this.pool, fn)
  }

  /** Whether the context's role grants a permission. */
  can(ctx: BrandContext, permission: PermissionKey): boolean {
    return roleHasPermission(ctx.roleName, permission)
  }

  /** Enforce a permission for the context; throws PermissionDeniedError if absent (programmatic Level-3 gate). */
  assertCan(ctx: BrandContext, permission: PermissionKey): void {
    if (!this.can(ctx, permission)) throw new PermissionDeniedError(permission)
  }

  /** The /me/permissions payload for the context's role (UI visibility — not the enforcement boundary). */
  permissionsFor(ctx: BrandContext): MePermissions {
    return buildMePermissions(ctx.roleName)
  }

  /** Last-owner protection — throws LastOwnerError if the change would leave the org without an Owner. */
  async assertNotLastOwner(organizationId: string, membershipIdBeingChanged: string): Promise<void> {
    await this.controlPlane((c) => assertNotLastOwner(c, organizationId, membershipIdBeingChanged))
  }
}
