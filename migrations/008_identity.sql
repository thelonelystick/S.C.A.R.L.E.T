ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified boolean NOT NULL DEFAULT false;
CREATE TABLE identity_challenges (
 digest text PRIMARY KEY, user_id text NOT NULL REFERENCES users ON DELETE CASCADE, purpose text NOT NULL CHECK(purpose IN ('verify','reset')),
 expires timestamptz NOT NULL, UNIQUE(user_id,purpose)
);
