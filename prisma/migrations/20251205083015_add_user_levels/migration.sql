-- CreateEnum
CREATE TYPE "UserLevel" AS ENUM ('Admin', 'Manager', 'RegularJoe');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "firstName" TEXT,
ADD COLUMN     "lastName" TEXT,
ADD COLUMN     "userLevel" "UserLevel" NOT NULL DEFAULT 'Admin';
