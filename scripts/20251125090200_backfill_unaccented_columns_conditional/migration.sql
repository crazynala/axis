-- Conditional backfill for unaccented shadow columns
-- This updates only when the target is NULL or differs from unaccent(source)

-- Company
UPDATE "Company"
SET "nameUnaccented" = unaccent(name)
WHERE "nameUnaccented" IS NULL OR "nameUnaccented" <> unaccent(name);

-- Product
UPDATE "Product"
SET "nameUnaccented" = unaccent(name)
WHERE "nameUnaccented" IS NULL OR "nameUnaccented" <> unaccent(name);

UPDATE "Product"
SET "descriptionUnaccented" = unaccent(description)
WHERE "descriptionUnaccented" IS NULL OR "descriptionUnaccented" <> unaccent(description);

UPDATE "Product"
SET "notesUnaccented" = unaccent(notes)
WHERE "notesUnaccented" IS NULL OR "notesUnaccented" <> unaccent(notes);

-- Assembly
UPDATE "Assembly"
SET "nameUnaccented" = unaccent(name)
WHERE "nameUnaccented" IS NULL OR "nameUnaccented" <> unaccent(name);

UPDATE "Assembly"
SET "notesUnaccented" = unaccent(notes)
WHERE "notesUnaccented" IS NULL OR "notesUnaccented" <> unaccent(notes);

-- Job
UPDATE "Job"
SET "nameUnaccented" = unaccent(name)
WHERE "nameUnaccented" IS NULL OR "nameUnaccented" <> unaccent(name);

UPDATE "Job"
SET "descriptionUnaccented" = unaccent(description)
WHERE "descriptionUnaccented" IS NULL OR "descriptionUnaccented" <> unaccent(description);
