-- AlterTable
ALTER TABLE "user" ADD COLUMN     "agreed_at" TIMESTAMP(3),
ADD COLUMN     "marketing_agreed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "marketing_agreed_at" TIMESTAMP(3);
