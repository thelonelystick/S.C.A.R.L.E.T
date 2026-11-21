ALTER TABLE connections ADD COLUMN IF NOT EXISTS wa_binding text;
UPDATE connections SET wa_binding=md5(random()::text || clock_timestamp()::text || user_id) WHERE kind='whatsapp' AND wa_binding IS NULL;
ALTER TABLE wa_messages ADD COLUMN IF NOT EXISTS phone_id text;
CREATE INDEX IF NOT EXISTS wa_phone_history ON wa_messages(user_id,phone_id,contact,created_at DESC);
ALTER TABLE wa_handoffs ADD COLUMN IF NOT EXISTS phone_id text NOT NULL DEFAULT '';
ALTER TABLE wa_handoffs DROP CONSTRAINT wa_handoffs_pkey;
ALTER TABLE wa_handoffs ADD PRIMARY KEY(user_id,phone_id,contact);
CREATE TABLE wa_reply_slots (
 user_id text NOT NULL REFERENCES users ON DELETE CASCADE,
 task_id text PRIMARY KEY,
 phone_id text NOT NULL,
 inbound_id text NOT NULL REFERENCES wa_messages(id) ON DELETE CASCADE,
 mode text NOT NULL CHECK(mode IN ('auto','assisted')),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(user_id,phone_id,inbound_id),
 FOREIGN KEY(user_id,task_id) REFERENCES tasks(user_id,id) ON DELETE CASCADE
);
CREATE INDEX wa_reply_budget ON wa_reply_slots(user_id,phone_id,created_at DESC);
CREATE TABLE wa_dispatches (
 task_id text PRIMARY KEY,
 user_id text NOT NULL,
 phone_id text NOT NULL,
 contact text NOT NULL,
 mode text NOT NULL CHECK(mode IN ('manual','auto')),
 provider_id text,
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(user_id,task_id) REFERENCES tasks(user_id,id) ON DELETE CASCADE
);
CREATE INDEX wa_send_budget ON wa_dispatches(user_id,phone_id,created_at DESC);
