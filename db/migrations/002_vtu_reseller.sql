ALTER TABLE users ADD COLUMN IF NOT EXISTS full_name text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS api_token_hash text UNIQUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_code text UNIQUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS referred_by uuid REFERENCES users(id);
ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_bonus_paid boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS users_api_token_hash_idx ON users(api_token_hash);
CREATE INDEX IF NOT EXISTS users_referred_by_idx ON users(referred_by);
