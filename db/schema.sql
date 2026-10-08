CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TABLE IF NOT EXISTS users(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),email text UNIQUE NOT NULL,password_hash text NOT NULL,role text NOT NULL DEFAULT 'customer',created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS wallets(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,balance_kobo bigint NOT NULL DEFAULT 0,updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS products(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),provider_product_id text UNIQUE,name text NOT NULL,description text,provider text,service_type text,category text,metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,price_kobo bigint NOT NULL DEFAULT 0,min_amount_kobo bigint,max_amount_kobo bigint,active boolean NOT NULL DEFAULT true,updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS wallet_transactions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL REFERENCES users(id),type text NOT NULL CHECK(type IN('credit','debit')),amount_kobo bigint NOT NULL,description text NOT NULL,reference text UNIQUE NOT NULL,status text NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS funding_requests(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL REFERENCES users(id),amount_kobo bigint NOT NULL,reference text UNIQUE NOT NULL,status text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),completed_at timestamptz);
CREATE TABLE IF NOT EXISTS wallet_ledger(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL REFERENCES users(id),wallet_id uuid NOT NULL REFERENCES wallets(id),type text NOT NULL,amount_kobo bigint NOT NULL,currency text NOT NULL,status text NOT NULL DEFAULT 'confirmed',reference text UNIQUE NOT NULL,event_id text UNIQUE,description text,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS orders(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL REFERENCES users(id),product_id uuid NOT NULL REFERENCES products(id),product_name text NOT NULL,qty integer NOT NULL,total_kobo bigint NOT NULL,status text NOT NULL,provider text,provider_order_id text,purchase_data_json jsonb,product_details jsonb,reported_at timestamptz,report_reason text,replacement_note text,created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS orders_user_idx ON orders(user_id,created_at DESC);
CREATE TABLE IF NOT EXISTS webhook_events(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),event_id text UNIQUE NOT NULL,reference text,event_type text NOT NULL,processed_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS admin_audit_logs(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),admin_user_id uuid NOT NULL REFERENCES users(id),action text NOT NULL,target_type text,target_id text,details_json jsonb NOT NULL DEFAULT '{}'::jsonb,ip_address text,created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS admin_audit_logs_created_idx ON admin_audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS admin_audit_logs_admin_idx ON admin_audit_logs(admin_user_id,created_at DESC);

CREATE TABLE IF NOT EXISTS admin_settings(key text PRIMARY KEY,value text NOT NULL DEFAULT '',updated_by uuid REFERENCES users(id),updated_at timestamptz NOT NULL DEFAULT now());
INSERT INTO admin_settings(key,value) VALUES
('platformName','MultiKartX'),('markupPercent','0'),('lowFloatThreshold','50000'),('criticalFloatThreshold','10000'),('alertEmail',''),('alertPhone',''),('maintenanceMode','false')
ON CONFLICT(key) DO NOTHING;


CREATE TABLE IF NOT EXISTS admin_permissions(
  admin_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  permission text NOT NULL,
  granted boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(admin_user_id,permission)
);
CREATE INDEX IF NOT EXISTS admin_permissions_permission_idx ON admin_permissions(permission,granted);

CREATE TABLE IF NOT EXISTS refund_records(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid UNIQUE NOT NULL REFERENCES orders(id),
  user_id uuid NOT NULL REFERENCES users(id),
  amount_kobo bigint NOT NULL CHECK(amount_kobo > 0),
  reason text NOT NULL,
  reference text UNIQUE NOT NULL,
  status text NOT NULL DEFAULT 'completed',
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS refund_records_user_idx ON refund_records(user_id,created_at DESC);

CREATE TABLE IF NOT EXISTS withdrawal_requests(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  amount_kobo bigint NOT NULL CHECK(amount_kobo > 0),
  destination text NOT NULL,
  reference text UNIQUE NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  note text,
  processed_by uuid REFERENCES users(id),
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS withdrawal_requests_status_idx ON withdrawal_requests(status,created_at DESC);

-- User profile enrichment (also applied by db/migrations/002_vtu_reseller.sql)
ALTER TABLE users ADD COLUMN IF NOT EXISTS full_name text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS api_token_hash text UNIQUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_code text UNIQUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS referred_by uuid REFERENCES users(id);
ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_bonus_paid boolean NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';
ALTER TABLE users ADD COLUMN IF NOT EXISTS kyc_tier integer NOT NULL DEFAULT 1;
ALTER TABLE users ADD COLUMN IF NOT EXISTS two_factor_secret text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
CREATE INDEX IF NOT EXISTS users_api_token_hash_idx ON users(api_token_hash);
CREATE INDEX IF NOT EXISTS users_referred_by_idx ON users(referred_by);

-- Product catalog enrichment
ALTER TABLE products ADD COLUMN IF NOT EXISTS markup_percent numeric(6,2);
ALTER TABLE products ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

-- Order cost/profit and provider tracking
ALTER TABLE orders ADD COLUMN IF NOT EXISTS amount_cost bigint NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS amount_sold bigint NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS profit bigint NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS provider_ref text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS provider_session text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS request_payload jsonb;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS response_payload jsonb;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS api_response text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS failure_reason text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_ref text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE TABLE IF NOT EXISTS product_sync_logs(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  synced integer NOT NULL DEFAULT 0,
  updated integer NOT NULL DEFAULT 0,
  deactivated integer NOT NULL DEFAULT 0,
  errors jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS product_sync_logs_created_idx ON product_sync_logs(created_at DESC);

CREATE TABLE IF NOT EXISTS notifications(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type text NOT NULL DEFAULT 'info',
  title text NOT NULL,
  message text NOT NULL,
  is_read boolean NOT NULL DEFAULT false,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notifications_user_idx ON notifications(user_id,created_at DESC);

CREATE TABLE IF NOT EXISTS support_tickets(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject text NOT NULL,
  category text NOT NULL DEFAULT 'general',
  priority text NOT NULL DEFAULT 'medium',
  status text NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS support_tickets_status_idx ON support_tickets(status,created_at DESC);

CREATE TABLE IF NOT EXISTS support_messages(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  admin_id uuid REFERENCES users(id) ON DELETE SET NULL,
  message text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS support_messages_ticket_idx ON support_messages(ticket_id,created_at ASC);

CREATE TABLE IF NOT EXISTS password_reset_tokens(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, token_hash)
);
CREATE INDEX IF NOT EXISTS password_reset_tokens_hash_idx ON password_reset_tokens(token_hash);

CREATE TABLE IF NOT EXISTS refresh_tokens(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS refresh_tokens_user_idx ON refresh_tokens(user_id,expires_at);

CREATE TABLE IF NOT EXISTS provider_configs(provider text PRIMARY KEY,enabled boolean NOT NULL DEFAULT false,base_url text NOT NULL DEFAULT '',public_key text NOT NULL DEFAULT '',secret_json text NOT NULL DEFAULT '',extra_json jsonb NOT NULL DEFAULT '{}'::jsonb,updated_by uuid REFERENCES users(id),updated_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS provider_configs_updated_idx ON provider_configs(updated_at DESC);


-- Production hardening
ALTER TABLE orders ADD COLUMN IF NOT EXISTS idempotency_key text;
CREATE UNIQUE INDEX IF NOT EXISTS orders_idempotency_key_idx ON orders(idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS products_service_active_idx ON products(service_type,active,category,name);
CREATE INDEX IF NOT EXISTS wallet_transactions_reference_idx ON wallet_transactions(reference);
CREATE INDEX IF NOT EXISTS wallet_ledger_user_created_idx ON wallet_ledger(user_id,created_at DESC);
CREATE INDEX IF NOT EXISTS funding_requests_status_idx ON funding_requests(status,created_at DESC);
CREATE INDEX IF NOT EXISTS orders_provider_ref_idx ON orders(provider,provider_order_id);
CREATE INDEX IF NOT EXISTS notifications_unread_idx ON notifications(user_id,is_read,created_at DESC);
