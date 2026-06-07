-- ============================================================================
-- §11 SUPPORT DOMAIN — tickets/conversations/messages as commerce events. Owner: Support/Inbox svc. Phase 3.
-- PII minimized (bodies redacted in storage); searchable via OpenSearch (PII-redacted). cm2_impact captures
-- support-saved margin. customer_id/order_id are logical cross-service refs (§1.4); facts → ClickHouse fact_support.
-- ============================================================================
SET client_min_messages = warning;
CREATE SCHEMA IF NOT EXISTS support;
GRANT USAGE ON SCHEMA support TO brain_app;

CREATE TABLE IF NOT EXISTS support.tickets (
  id               uuid PRIMARY KEY DEFAULT uuidv7(),
  brand_id         uuid NOT NULL,
  customer_id      uuid,                                       -- logical ref identity.customers.id
  order_id         uuid,                                       -- logical ref commerce.orders.id
  channel          channel_t NOT NULL,                         -- whatsapp|email|chat|ig_dm|voice
  category         text NOT NULL CHECK (category IN (
                     'order_status','delivery_delay','ndr','address_change','cancel','return','refund_status',
                     'replacement','missing_damaged','product_reco','usage_education','cod_to_prepaid',
                     'payment_failed','coupon_issue','complaint')),
  status           text NOT NULL CHECK (status IN ('open','pending','resolved','escalated','closed')),
  resolution_type  text CHECK (resolution_type IN ('auto','drafted','human','escalated')),
  cm2_impact_minor bigint,                                     -- support-saved CM2 (refund prevented, exchange, retention)
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_tickets_customer ON support.tickets(brand_id, customer_id);
CREATE INDEX IF NOT EXISTS ix_tickets_order    ON support.tickets(brand_id, order_id);
CREATE INDEX IF NOT EXISTS ix_tickets_status   ON support.tickets(brand_id, status);
CREATE INDEX IF NOT EXISTS ix_tickets_category ON support.tickets(brand_id, category);
SELECT brain_apply_updated_at('support.tickets');
SELECT brain_apply_brand_rls('support.tickets');
SELECT brain_meta.register('support','tickets',3,'support-inbox','aurora');

CREATE TABLE IF NOT EXISTS support.conversations (
  id         uuid PRIMARY KEY DEFAULT uuidv7(),
  brand_id   uuid NOT NULL,
  ticket_id  uuid NOT NULL REFERENCES support.tickets(id) ON DELETE CASCADE,
  channel    channel_t NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_conversations_ticket ON support.conversations(brand_id, ticket_id);
SELECT brain_apply_brand_rls('support.conversations');
SELECT brain_meta.register('support','conversations',3,'support-inbox','aurora');

CREATE TABLE IF NOT EXISTS support.messages (
  id              uuid PRIMARY KEY DEFAULT uuidv7(),
  brand_id        uuid NOT NULL,
  conversation_id uuid NOT NULL REFERENCES support.conversations(id) ON DELETE CASCADE,
  direction       text NOT NULL CHECK (direction IN ('inbound','outbound')),
  body_redacted   text,                                        -- PII-redacted in storage
  ts              timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_messages_conv ON support.messages(brand_id, conversation_id, ts);
SELECT brain_apply_brand_rls('support.messages');
SELECT brain_meta.register('support','messages',3,'support-inbox','aurora');

-- OpenSearch indices (customer-search / order-search / ticket-search) are derived + rebuildable, workspace-scoped
-- via a brand_id filter alias — NOT Postgres tables (see warehouse/opensearch).
