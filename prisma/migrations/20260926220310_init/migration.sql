-- CreateEnum
CREATE TYPE "date_precision" AS ENUM ('DAY', 'MONTH');

-- CreateEnum
CREATE TYPE "sync_action" AS ENUM ('UPSERT', 'DELETE');

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "is_online" BOOLEAN NOT NULL DEFAULT false,
    "scope" TEXT,
    "expires" TIMESTAMP(3),
    "access_token" TEXT NOT NULL,
    "user_id" BIGINT,
    "first_name" TEXT,
    "last_name" TEXT,
    "email" TEXT,
    "account_owner" BOOLEAN NOT NULL DEFAULT false,
    "locale" TEXT,
    "collaborator" BOOLEAN DEFAULT false,
    "email_verified" BOOLEAN DEFAULT false,
    "refresh_token" TEXT,
    "refresh_token_expires" TIMESTAMP(3),

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "certificates" (
    "id" SERIAL NOT NULL,
    "shop" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "item" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "order_id" TEXT,
    "order_name" TEXT,
    "line_item_id" TEXT,
    "line_item_title" TEXT,
    "photo_url" TEXT,
    "photo_file_id" TEXT,
    "video_url" TEXT,
    "video_file_id" TEXT,
    "video_preview_url" TEXT,
    "photo_error" TEXT,
    "video_error" TEXT,
    "product_id" TEXT,
    "product_title" TEXT,
    "product_image_url" TEXT,
    "search_text" TEXT NOT NULL DEFAULT '',
    "latest_signed_on" DATE,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "certificates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "signers" (
    "id" SERIAL NOT NULL,
    "certificate_id" INTEGER NOT NULL,
    "position" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "signed_on" DATE,
    "date_precision" "date_precision",
    "location" TEXT,

    CONSTRAINT "signers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sync_failures" (
    "certificate_id" INTEGER NOT NULL,
    "shop" TEXT NOT NULL,
    "action" "sync_action" NOT NULL,
    "version" INTEGER NOT NULL,
    "handle" TEXT NOT NULL,
    "stale_handles" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sync_failures_pkey" PRIMARY KEY ("certificate_id")
);

-- CreateTable
CREATE TABLE "legacy_imports" (
    "shop" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "record_hash" TEXT NOT NULL,
    "source_index" INTEGER NOT NULL,
    "record" JSONB NOT NULL,
    "overrides" JSONB NOT NULL,
    "certificate_id" INTEGER,
    "imported_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "legacy_imports_pkey" PRIMARY KEY ("shop","code")
);

-- CreateIndex
CREATE INDEX "certificates_shop_created_at_id_idx" ON "certificates"("shop", "created_at" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "certificates_shop_updated_at_idx" ON "certificates"("shop", "updated_at" DESC);

-- CreateIndex
CREATE INDEX "certificates_shop_latest_signed_on_idx" ON "certificates"("shop", "latest_signed_on");

-- CreateIndex
CREATE INDEX "certificates_shop_order_id_idx" ON "certificates"("shop", "order_id");

-- CreateIndex
CREATE INDEX "certificates_shop_order_name_idx" ON "certificates"("shop", "order_name");

-- CreateIndex
CREATE INDEX "certificates_shop_line_item_id_idx" ON "certificates"("shop", "line_item_id");

-- CreateIndex
CREATE UNIQUE INDEX "certificates_shop_code_key" ON "certificates"("shop", "code");

-- CreateIndex
CREATE INDEX "signers_certificate_id_position_idx" ON "signers"("certificate_id", "position");

-- CreateIndex
CREATE INDEX "sync_failures_shop_updated_at_idx" ON "sync_failures"("shop", "updated_at");

-- CreateIndex
CREATE UNIQUE INDEX "legacy_imports_certificate_id_key" ON "legacy_imports"("certificate_id");

-- AddForeignKey
ALTER TABLE "signers" ADD CONSTRAINT "signers_certificate_id_fkey" FOREIGN KEY ("certificate_id") REFERENCES "certificates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "legacy_imports" ADD CONSTRAINT "legacy_imports_certificate_id_fkey" FOREIGN KEY ("certificate_id") REFERENCES "certificates"("id") ON DELETE SET NULL ON UPDATE CASCADE;
