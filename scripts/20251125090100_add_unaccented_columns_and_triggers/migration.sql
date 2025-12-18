-- Add unaccented shadow columns and triggers to keep them normalized
-- Requires the unaccent extension (enabled earlier)

-- 1) Add columns
ALTER TABLE "Product"
  ADD COLUMN IF NOT EXISTS "nameUnaccented" TEXT,
  ADD COLUMN IF NOT EXISTS "descriptionUnaccented" TEXT,
  ADD COLUMN IF NOT EXISTS "notesUnaccented" TEXT;

ALTER TABLE "Company"
  ADD COLUMN IF NOT EXISTS "nameUnaccented" TEXT;

ALTER TABLE "Assembly"
  ADD COLUMN IF NOT EXISTS "nameUnaccented" TEXT,
  ADD COLUMN IF NOT EXISTS "notesUnaccented" TEXT;

ALTER TABLE "Job"
  ADD COLUMN IF NOT EXISTS "nameUnaccented" TEXT,
  ADD COLUMN IF NOT EXISTS "descriptionUnaccented" TEXT;

-- 2) Functions per table to normalize shadow columns
CREATE OR REPLACE FUNCTION normalize_unaccented_product() RETURNS trigger AS $$
BEGIN
  NEW."nameUnaccented" := CASE WHEN NEW.name IS NULL THEN NULL ELSE unaccent(NEW.name) END;
  NEW."descriptionUnaccented" := CASE WHEN NEW.description IS NULL THEN NULL ELSE unaccent(NEW.description) END;
  NEW."notesUnaccented" := CASE WHEN NEW.notes IS NULL THEN NULL ELSE unaccent(NEW.notes) END;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION normalize_unaccented_company() RETURNS trigger AS $$
BEGIN
  NEW."nameUnaccented" := CASE WHEN NEW.name IS NULL THEN NULL ELSE unaccent(NEW.name) END;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION normalize_unaccented_assembly() RETURNS trigger AS $$
BEGIN
  NEW."nameUnaccented" := CASE WHEN NEW.name IS NULL THEN NULL ELSE unaccent(NEW.name) END;
  NEW."notesUnaccented" := CASE WHEN NEW.notes IS NULL THEN NULL ELSE unaccent(NEW.notes) END;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION normalize_unaccented_job() RETURNS trigger AS $$
BEGIN
  NEW."nameUnaccented" := CASE WHEN NEW.name IS NULL THEN NULL ELSE unaccent(NEW.name) END;
  NEW."descriptionUnaccented" := CASE WHEN NEW.description IS NULL THEN NULL ELSE unaccent(NEW.description) END;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3) Triggers (drop if exist, then create)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_normalize_product') THEN
    DROP TRIGGER trg_normalize_product ON "Product";
  END IF;
END $$;
CREATE TRIGGER trg_normalize_product
BEFORE INSERT OR UPDATE ON "Product"
FOR EACH ROW EXECUTE FUNCTION normalize_unaccented_product();

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_normalize_company') THEN
    DROP TRIGGER trg_normalize_company ON "Company";
  END IF;
END $$;
CREATE TRIGGER trg_normalize_company
BEFORE INSERT OR UPDATE ON "Company"
FOR EACH ROW EXECUTE FUNCTION normalize_unaccented_company();

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_normalize_assembly') THEN
    DROP TRIGGER trg_normalize_assembly ON "Assembly";
  END IF;
END $$;
CREATE TRIGGER trg_normalize_assembly
BEFORE INSERT OR UPDATE ON "Assembly"
FOR EACH ROW EXECUTE FUNCTION normalize_unaccented_assembly();

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_normalize_job') THEN
    DROP TRIGGER trg_normalize_job ON "Job";
  END IF;
END $$;
CREATE TRIGGER trg_normalize_job
BEFORE INSERT OR UPDATE ON "Job"
FOR EACH ROW EXECUTE FUNCTION normalize_unaccented_job();

-- 4) Backfill existing rows (optional but useful)
UPDATE "Product" SET 
  "nameUnaccented" = CASE WHEN name IS NULL THEN NULL ELSE unaccent(name) END,
  "descriptionUnaccented" = CASE WHEN description IS NULL THEN NULL ELSE unaccent(description) END,
  "notesUnaccented" = CASE WHEN notes IS NULL THEN NULL ELSE unaccent(notes) END
WHERE id IS NOT NULL;

UPDATE "Company" SET 
  "nameUnaccented" = CASE WHEN name IS NULL THEN NULL ELSE unaccent(name) END
WHERE id IS NOT NULL;

UPDATE "Assembly" SET 
  "nameUnaccented" = CASE WHEN name IS NULL THEN NULL ELSE unaccent(name) END,
  "notesUnaccented" = CASE WHEN notes IS NULL THEN NULL ELSE unaccent(notes) END
WHERE id IS NOT NULL;

UPDATE "Job" SET 
  "nameUnaccented" = CASE WHEN name IS NULL THEN NULL ELSE unaccent(name) END,
  "descriptionUnaccented" = CASE WHEN description IS NULL THEN NULL ELSE unaccent(description) END
WHERE id IS NOT NULL;
