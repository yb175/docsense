-- CreateEnum
CREATE TYPE "DocumentShareStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REVOKED', 'EXPIRED');

-- CreateTable
CREATE TABLE "document_shares" (
    "id" UUID NOT NULL,
    "documentId" UUID NOT NULL,
    "inviteeEmail" VARCHAR(255) NOT NULL,
    "inviteeName" VARCHAR(100) NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "status" "DocumentShareStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "acceptedAt" TIMESTAMP(3),

    CONSTRAINT "document_shares_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "document_shares_tokenHash_key" ON "document_shares"("tokenHash");
CREATE INDEX "document_shares_documentId_idx" ON "document_shares"("documentId");
CREATE INDEX "document_shares_documentId_status_idx" ON "document_shares"("documentId", "status");

-- AddForeignKey
ALTER TABLE "document_shares" ADD CONSTRAINT "document_shares_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;
