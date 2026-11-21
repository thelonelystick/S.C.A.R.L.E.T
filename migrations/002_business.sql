CREATE TABLE IF NOT EXISTS wa_handoffs(user_id text NOT NULL REFERENCES users ON DELETE CASCADE,contact text NOT NULL,reason text NOT NULL,PRIMARY KEY(user_id,contact));
