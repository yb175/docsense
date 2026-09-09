-- CreateTable
CREATE TABLE "comments" (
    "id" UUID NOT NULL,
    "documentId" UUID NOT NULL,
    "parentId" UUID,
    "userId" UUID,
    "shareId" UUID,
    "content" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "comments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "comments_documentId_parentId_createdAt_idx" ON "comments"("documentId", "parentId", "createdAt");
CREATE INDEX "comments_userId_idx" ON "comments"("userId");
CREATE INDEX "comments_shareId_idx" ON "comments"("shareId");

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "comments" ADD CONSTRAINT "comments_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "comments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "comments" ADD CONSTRAINT "comments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "comments" ADD CONSTRAINT "comments_shareId_fkey" FOREIGN KEY ("shareId") REFERENCES "document_shares"("id") ON DELETE CASCADE ON UPDATE CASCADE;
