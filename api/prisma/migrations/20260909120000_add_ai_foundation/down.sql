DROP TABLE IF EXISTS "messages";
DROP TABLE IF EXISTS "conversations";
DROP TABLE IF EXISTS "document_chunks";

ALTER TABLE "Document"
  DROP COLUMN IF EXISTS "aiSummary",
  DROP COLUMN IF EXISTS "processingStatus";

DROP TYPE IF EXISTS "MessageRole";
DROP TYPE IF EXISTS "DocumentProcessingStatus";

-- Keep the vector extension installed because it may be shared by later migrations.
