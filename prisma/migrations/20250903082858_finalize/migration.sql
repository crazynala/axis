-- CreateTable
CREATE TABLE "AssemblyActivity" (
    "id" SERIAL NOT NULL,
    "assemblyId" INTEGER,
    "jobId" INTEGER,
    "name" TEXT,
    "description" TEXT,
    "startTime" TIMESTAMP(3),
    "endTime" TIMESTAMP(3),
    "status" TEXT,
    "notes" TEXT,

    CONSTRAINT "AssemblyActivity_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "AssemblyActivity" ADD CONSTRAINT "AssemblyActivity_assemblyId_fkey" FOREIGN KEY ("assemblyId") REFERENCES "Assembly"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssemblyActivity" ADD CONSTRAINT "AssemblyActivity_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE SET NULL ON UPDATE CASCADE;
