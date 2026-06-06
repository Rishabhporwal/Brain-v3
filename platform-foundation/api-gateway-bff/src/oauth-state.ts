/**
 * OAuth signed-state helpers now live in the shared connector framework (@brain/connector-kit). This file
 * re-exports them so existing BFF imports keep working while the logic is owned by the kit (P0).
 */
export { signOAuthState, verifyOAuthState, safeReturnTo, type OAuthStatePayload } from '@brain/connector-kit'
