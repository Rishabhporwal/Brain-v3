// The fail-closed exception filter now lives in the shared adoption layer and is registered globally by
// AccessControlModule.forRoot() (APP_FILTER). Re-exported for any direct reference.
export { AccessControlExceptionFilter } from '@brain/access-control-nest'
