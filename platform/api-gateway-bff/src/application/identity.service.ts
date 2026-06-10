// Operator-identity resolution now lives in the shared adoption layer so every service shares one
// implementation. Re-exported here to keep existing local import paths stable.
export { IdentityService, emailHash } from '@brain/access-control-nest'
