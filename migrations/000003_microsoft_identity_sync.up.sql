-- See the monorepo migration migrations/postgresql/011_microsoft_identity_sync.sql.
-- Kept here as the service-local migration source for standalone deployments.

ALTER TABLE users ADD COLUMN IF NOT EXISTS identity_source VARCHAR(20) NOT NULL DEFAULT 'local';
ALTER TABLE users ADD COLUMN IF NOT EXISTS external_id VARCHAR(128);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_external_id ON users(external_id) WHERE external_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_identity_source ON users(identity_source);

CREATE TABLE IF NOT EXISTS m365_settings (
    id SERIAL PRIMARY KEY,
    tenant_id VARCHAR(128) NOT NULL DEFAULT '', client_id VARCHAR(128) NOT NULL DEFAULT '',
    client_secret TEXT NOT NULL DEFAULT '', mailbox_id VARCHAR(255) NOT NULL DEFAULT '',
    sync_interval VARCHAR(32) NOT NULL DEFAULT '5m', calendar_mailbox VARCHAR(255) NOT NULL DEFAULT '',
    app_base_url VARCHAR(512) NOT NULL DEFAULT '', user_mode VARCHAR(20) NOT NULL DEFAULT 'local',
    user_sync_enabled BOOLEAN NOT NULL DEFAULT FALSE, user_group_id VARCHAR(128) NOT NULL DEFAULT '',
    user_sync_interval_minutes INT NOT NULL DEFAULT 60, disable_removed_users BOOLEAN NOT NULL DEFAULT TRUE,
    microsoft_login_enabled BOOLEAN NOT NULL DEFAULT FALSE, last_user_sync_at TIMESTAMPTZ,
    last_user_sync_status VARCHAR(32) NOT NULL DEFAULT 'never', last_user_sync_error TEXT NOT NULL DEFAULT '',
    last_user_sync_count INT NOT NULL DEFAULT 0, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS microsoft_user_profiles (
    user_id INT PRIMARY KEY REFERENCES users(userid) ON DELETE CASCADE,
    microsoft_id VARCHAR(128) NOT NULL UNIQUE, user_principal_name VARCHAR(255) NOT NULL DEFAULT '',
    display_name VARCHAR(255) NOT NULL DEFAULT '', job_title VARCHAR(255) NOT NULL DEFAULT '',
    department VARCHAR(255) NOT NULL DEFAULT '', office_location VARCHAR(255) NOT NULL DEFAULT '',
    mobile_phone VARCHAR(100) NOT NULL DEFAULT '', business_phones JSONB NOT NULL DEFAULT '[]'::jsonb,
    preferred_language VARCHAR(32) NOT NULL DEFAULT '', raw_profile JSONB NOT NULL DEFAULT '{}'::jsonb,
    last_synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO m365_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
