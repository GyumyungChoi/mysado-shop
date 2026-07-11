-- AlterTable
ALTER TABLE "product_view_log" ALTER COLUMN "productId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "product_view_log" ADD CONSTRAINT "product_view_log_productId_fkey" FOREIGN KEY ("productId") REFERENCES "product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
