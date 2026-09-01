-- CreateEnum
CREATE TYPE "staff_role" AS ENUM ('staf', 'finance', 'admin');

-- CreateEnum
CREATE TYPE "expense_status" AS ENUM ('auto', 'dikoreksi_manual', 'input_manual', 'perlu_review');

-- CreateEnum
CREATE TYPE "audit_action" AS ENUM ('created', 'corrected', 'manual_input', 'duplicate_flagged', 'status_updated', 'deleted');

-- CreateTable
CREATE TABLE "staff" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "phone_number" TEXT NOT NULL,
    "role" "staff_role" NOT NULL DEFAULT 'staf',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "staff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "keywords" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expenses" (
    "id" UUID NOT NULL,
    "staff_id" UUID NOT NULL,
    "category_id" UUID,
    "merchant" TEXT NOT NULL,
    "transaction_date" DATE NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "status" "expense_status" NOT NULL DEFAULT 'auto',
    "receipt_image_path" TEXT,
    "raw_ocr_response" JSONB,
    "confidence_score" DECIMAL(5,4),
    "notes" TEXT,
    "sheet_row_id" TEXT,
    "synced_to_sheet" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "expenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" UUID NOT NULL,
    "expense_id" UUID,
    "action" "audit_action" NOT NULL,
    "actor_phone" TEXT NOT NULL,
    "old_value" JSONB,
    "new_value" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sync_failures" (
    "id" UUID NOT NULL,
    "expense_id" UUID NOT NULL,
    "attempt_count" INTEGER NOT NULL DEFAULT 1,
    "last_error" TEXT NOT NULL,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "sync_failures_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "staff_phone_number_key" ON "staff"("phone_number");

-- CreateIndex
CREATE UNIQUE INDEX "categories_name_key" ON "categories"("name");

-- CreateIndex
CREATE INDEX "expenses_staff_id_idx" ON "expenses"("staff_id");

-- CreateIndex
CREATE INDEX "expenses_transaction_date_idx" ON "expenses"("transaction_date");

-- CreateIndex
CREATE INDEX "expenses_status_idx" ON "expenses"("status");

-- CreateIndex
CREATE INDEX "expenses_synced_to_sheet_idx" ON "expenses"("synced_to_sheet");

-- CreateIndex
CREATE INDEX "expenses_category_id_idx" ON "expenses"("category_id");

-- CreateIndex
CREATE INDEX "expenses_staff_id_transaction_date_amount_idx" ON "expenses"("staff_id", "transaction_date", "amount");

-- CreateIndex
CREATE INDEX "audit_log_expense_id_idx" ON "audit_log"("expense_id");

-- CreateIndex
CREATE INDEX "audit_log_actor_phone_idx" ON "audit_log"("actor_phone");

-- CreateIndex
CREATE INDEX "audit_log_created_at_idx" ON "audit_log"("created_at");

-- CreateIndex
CREATE INDEX "sync_failures_expense_id_idx" ON "sync_failures"("expense_id");

-- CreateIndex
CREATE INDEX "sync_failures_resolved_idx" ON "sync_failures"("resolved");

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_expense_id_fkey" FOREIGN KEY ("expense_id") REFERENCES "expenses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sync_failures" ADD CONSTRAINT "sync_failures_expense_id_fkey" FOREIGN KEY ("expense_id") REFERENCES "expenses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
