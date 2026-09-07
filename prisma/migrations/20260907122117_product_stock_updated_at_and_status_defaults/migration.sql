-- AlterTable
ALTER TABLE "product" ADD COLUMN     "stock_updated_at" TIMESTAMP(3),
ALTER COLUMN "status" SET DEFAULT 'DRAFT',
ALTER COLUMN "is_active" SET DEFAULT false;

