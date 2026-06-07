// BrandContextGuard now lives in the shared adoption layer (@brain/access-control-nest) so every service
// enforces membership the same way. Re-exported to keep existing local import paths stable.
export { BrandContextGuard } from '@brain/access-control-nest'
