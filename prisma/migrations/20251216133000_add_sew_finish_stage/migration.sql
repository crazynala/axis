-- Rename legacy 'make' stage to 'finish' and add 'sew'
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_type t
        JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE t.typname = 'AssemblyStage'
    ) THEN
        RAISE NOTICE 'AssemblyStage enum missing, skipping modifications';
    ELSE
        BEGIN
            ALTER TYPE "AssemblyStage" RENAME VALUE 'make' TO 'finish';
        EXCEPTION
            WHEN undefined_object THEN NULL;
        END;
        BEGIN
            ALTER TYPE "AssemblyStage" ADD VALUE IF NOT EXISTS 'sew';
        EXCEPTION
            WHEN duplicate_object THEN NULL;
        END;
    END IF;
END$$;
