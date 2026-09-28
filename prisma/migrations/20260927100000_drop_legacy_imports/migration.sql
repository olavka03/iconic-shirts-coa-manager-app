-- DropForeignKey
ALTER TABLE "legacy_imports" DROP CONSTRAINT "legacy_imports_certificate_id_fkey";

-- DropTable
DROP TABLE "legacy_imports";

