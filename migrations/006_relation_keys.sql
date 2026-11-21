CREATE UNIQUE INDEX IF NOT EXISTS approvals_owner_task ON approvals(user_id,task_id);
CREATE UNIQUE INDEX IF NOT EXISTS dispatch_owner_task ON wa_dispatches(user_id,task_id);
CREATE UNIQUE INDEX IF NOT EXISTS reply_owner_task ON wa_reply_slots(user_id,task_id);
