-- CreateEnum
CREATE TYPE "ColorScheme" AS ENUM ('light', 'dark');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "colorScheme" "ColorScheme" NOT NULL DEFAULT 'light';
