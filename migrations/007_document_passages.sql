CREATE UNIQUE INDEX documents_owner_id ON documents(user_id,id);
CREATE TABLE document_passages (
  user_id text NOT NULL,
  document_id text NOT NULL,
  part integer NOT NULL CHECK (part BETWEEN 1 AND 64),
  body text NOT NULL,
  terms tsvector GENERATED ALWAYS AS (to_tsvector('simple',body)) STORED,
  vec vector(1536),
  vector_model text,
  PRIMARY KEY (user_id,document_id,part),
  FOREIGN KEY (user_id,document_id) REFERENCES documents(user_id,id) ON DELETE CASCADE
);
CREATE INDEX document_passages_terms ON document_passages USING gin(terms);
