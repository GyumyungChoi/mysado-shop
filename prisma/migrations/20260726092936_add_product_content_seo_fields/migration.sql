-- AlterTable
ALTER TABLE "product" ADD COLUMN     "compatible_models" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "content_meta" JSONB,
ADD COLUMN     "content_status" TEXT NOT NULL DEFAULT 'raw',
ADD COLUMN     "highlights" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "seo_description" TEXT,
ADD COLUMN     "seo_title" TEXT,
ADD COLUMN     "specs" JSONB;
