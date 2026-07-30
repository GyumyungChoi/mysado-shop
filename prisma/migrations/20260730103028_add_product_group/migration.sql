-- AlterTable
ALTER TABLE "product" ADD COLUMN     "group_id" TEXT,
ADD COLUMN     "group_role" TEXT,
ADD COLUMN     "variant_label" TEXT;

-- CreateTable
CREATE TABLE "product_group" (
    "id" TEXT NOT NULL,
    "group_key" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "representative_id" TEXT,
    "category" TEXT,
    "content_status" TEXT NOT NULL DEFAULT 'raw',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_group_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "product_group_group_key_key" ON "product_group"("group_key");

-- CreateIndex
CREATE INDEX "product_group_id_idx" ON "product"("group_id");

-- AddForeignKey
ALTER TABLE "product" ADD CONSTRAINT "product_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "product_group"("id") ON DELETE SET NULL ON UPDATE CASCADE;
