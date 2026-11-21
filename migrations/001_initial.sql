CREATE TABLE IF NOT EXISTS users (
 id text PRIMARY KEY, email text UNIQUE, name text NOT NULL, passhash text, role text NOT NULL DEFAULT 'USER' CHECK(role IN ('USER','ADMIN','SUPPORT')),
 guest boolean NOT NULL DEFAULT false, settings jsonb NOT NULL DEFAULT '{}', mfa text, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS sessions (hash text PRIMARY KEY, user_id text NOT NULL REFERENCES users ON DELETE CASCADE, expires timestamptz NOT NULL);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
CREATE TABLE IF NOT EXISTS connections (user_id text NOT NULL REFERENCES users ON DELETE CASCADE, kind text NOT NULL, secret text NOT NULL, label text NOT NULL, external_id text, updated_at timestamptz DEFAULT now(), PRIMARY KEY(user_id,kind));
CREATE UNIQUE INDEX IF NOT EXISTS one_business_inbox ON connections(external_id) WHERE kind='whatsapp';
CREATE TABLE IF NOT EXISTS oauth_states (state text PRIMARY KEY,user_id text NOT NULL REFERENCES users ON DELETE CASCADE,verifier text NOT NULL, kind text NOT NULL, expires timestamptz NOT NULL);
CREATE TABLE IF NOT EXISTS conversations (id text PRIMARY KEY,user_id text NOT NULL REFERENCES users ON DELETE CASCADE,title text NOT NULL,created_at timestamptz DEFAULT now(),UNIQUE(user_id,id));
CREATE TABLE IF NOT EXISTS messages (id text PRIMARY KEY,user_id text NOT NULL,conversation_id text NOT NULL,role text NOT NULL,body text NOT NULL,created_at timestamptz DEFAULT now(),FOREIGN KEY(user_id,conversation_id) REFERENCES conversations(user_id,id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS memories (id text PRIMARY KEY,user_id text NOT NULL REFERENCES users ON DELETE CASCADE,title text NOT NULL,body text NOT NULL,category text NOT NULL DEFAULT 'Preference',embedding jsonb,expires timestamptz,created_at timestamptz DEFAULT now());
CREATE TABLE IF NOT EXISTS documents (id text PRIMARY KEY,user_id text NOT NULL REFERENCES users ON DELETE CASCADE,name text NOT NULL,mime text NOT NULL,size integer NOT NULL,body text NOT NULL,original text NOT NULL,created_at timestamptz DEFAULT now());
CREATE TABLE IF NOT EXISTS tasks (id text PRIMARY KEY,user_id text NOT NULL REFERENCES users ON DELETE CASCADE,title text NOT NULL,kind text NOT NULL,state text NOT NULL,payload jsonb NOT NULL DEFAULT '{}',result jsonb,error text,run_at timestamptz NOT NULL DEFAULT now(),attempts integer NOT NULL DEFAULT 0,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now(),UNIQUE(user_id,id));
CREATE TABLE IF NOT EXISTS steps (id text PRIMARY KEY,user_id text NOT NULL,task_id text NOT NULL,body text NOT NULL,created_at timestamptz DEFAULT now(),FOREIGN KEY(user_id,task_id) REFERENCES tasks(user_id,id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS approvals (id text PRIMARY KEY,user_id text NOT NULL,task_id text NOT NULL UNIQUE,status text NOT NULL DEFAULT 'pending',created_at timestamptz DEFAULT now(),FOREIGN KEY(user_id,task_id) REFERENCES tasks(user_id,id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS events (id text PRIMARY KEY,user_id text NOT NULL REFERENCES users ON DELETE CASCADE,title text NOT NULL,start_at timestamptz NOT NULL,end_at timestamptz NOT NULL,CHECK(end_at>start_at));
CREATE TABLE IF NOT EXISTS audits (id text PRIMARY KEY,user_id text NOT NULL REFERENCES users ON DELETE CASCADE,title text NOT NULL,detail text NOT NULL DEFAULT '',kind text NOT NULL,created_at timestamptz DEFAULT now());
CREATE TABLE IF NOT EXISTS notifications (id text PRIMARY KEY,user_id text NOT NULL REFERENCES users ON DELETE CASCADE,body text NOT NULL,created_at timestamptz DEFAULT now());
CREATE TABLE IF NOT EXISTS usage (bucket text PRIMARY KEY,n integer NOT NULL,expires timestamptz NOT NULL);
CREATE TABLE IF NOT EXISTS wa_messages (id text PRIMARY KEY,user_id text NOT NULL REFERENCES users ON DELETE CASCADE,contact text NOT NULL,body text NOT NULL,direction text NOT NULL,created_at timestamptz NOT NULL);
CREATE INDEX IF NOT EXISTS task_queue ON tasks(state,run_at);
CREATE INDEX IF NOT EXISTS task_owner ON tasks(user_id,created_at DESC);
CREATE INDEX IF NOT EXISTS audit_feed ON audits(user_id,created_at DESC);
CREATE INDEX IF NOT EXISTS memory_owner ON memories(user_id);
CREATE INDEX IF NOT EXISTS msg_history ON messages(user_id,conversation_id,created_at);
CREATE INDEX IF NOT EXISTS doc_owner ON documents(user_id);
CREATE INDEX IF NOT EXISTS wa_threads ON wa_messages(user_id,contact,created_at DESC);
