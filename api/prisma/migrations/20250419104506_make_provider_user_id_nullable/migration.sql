-- AlterTable
ALTER TABLE "GitAccount" ALTER COLUMN "providerUserId" DROP NOT NULL,
ALTER COLUMN "accessToken" DROP NOT NULL;
