ALTER TABLE messages ADD COLUMN seq bigint GENERATED ALWAYS AS IDENTITY;
CREATE INDEX messages_owner_order ON messages(user_id,conversation_id,seq);
