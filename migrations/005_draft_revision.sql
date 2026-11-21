ALTER TABLE tasks ADD COLUMN revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0);
