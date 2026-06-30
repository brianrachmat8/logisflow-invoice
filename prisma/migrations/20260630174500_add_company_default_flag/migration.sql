ALTER TABLE "Company" ADD COLUMN "isDefault" BOOLEAN NOT NULL DEFAULT false;

UPDATE "Company"
SET "isDefault" = true
WHERE "id" = (
  SELECT "id"
  FROM "Company"
  ORDER BY "createdAt" ASC
  LIMIT 1
)
AND NOT EXISTS (
  SELECT 1 FROM "Company" WHERE "isDefault" = true
);
