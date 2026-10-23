CREATE TABLE auth_users (
 id uuid PRIMARY KEY,
 email text NOT NULL UNIQUE CHECK(email=lower(email)),
 name text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE auth_identities (
 provider text NOT NULL CHECK(provider IN ('email','github')),
 subject text NOT NULL,
 user_id uuid NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
 PRIMARY KEY(provider,subject)
);
CREATE TABLE auth_challenges (
 token_hash text PRIMARY KEY,
 kind text NOT NULL CHECK(kind IN ('email','github')),
 binding_hash text NOT NULL,
 payload jsonb NOT NULL,
 expires_at timestamptz NOT NULL
);
CREATE TABLE auth_sessions (
 token_hash text PRIMARY KEY,
 user_id uuid NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
 expires_at timestamptz NOT NULL
);
CREATE INDEX auth_sessions_expiry ON auth_sessions(expires_at);
CREATE INDEX auth_challenges_expiry ON auth_challenges(expires_at);
CREATE TABLE auth_rate_limits (
 key text PRIMARY KEY,
 count integer NOT NULL,
 expires_at timestamptz NOT NULL
);
ALTER TABLE projects ADD COLUMN owner_id uuid REFERENCES auth_users(id);
CREATE INDEX projects_owner_created ON projects(owner_id,created_at DESC);
-- Existing projects retain NULL ownership and remain available only to the operator.
