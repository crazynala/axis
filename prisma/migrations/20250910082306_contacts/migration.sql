-- CreateTable
CREATE TABLE "Contact" (
    "id" INTEGER NOT NULL,
    "addressId" INTEGER,
    "companyId" INTEGER,
    "email" TEXT,
    "department" TEXT,
    "firstName" TEXT,
    "lastName" TEXT,
    "title" TEXT,
    "phoneDirect" TEXT,
    "phoneHome" TEXT,
    "phoneMobile" TEXT,
    "position" TEXT,
    "recordType" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "modifiedBy" TEXT,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "Contact_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_addressId_fkey" FOREIGN KEY ("addressId") REFERENCES "Address"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;
