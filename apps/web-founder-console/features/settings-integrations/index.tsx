import { PageHeader } from '@/components/layout/page-header'
import { IntegrationsGrid } from '@/components/integrations/integrations-grid'

export function IntegrationsSettings() {
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Integrations" description="Connect Shopify, Meta, Google, Shiprocket, WhatsApp and more." />
      <IntegrationsGrid />
    </div>
  )
}
