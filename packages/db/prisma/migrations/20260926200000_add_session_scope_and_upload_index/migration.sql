-- AlterTable
ALTER TABLE "sessions" ADD COLUMN     "scope" TEXT;

-- CreateIndex
CREATE INDEX "media_blobs_uploader_id_created_at_idx" ON "media_blobs"("uploader_id", "created_at");

