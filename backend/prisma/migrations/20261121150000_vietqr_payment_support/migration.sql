CREATE TYPE "PaymentSupportStatus" AS ENUM ('OPEN', 'CONFIRMED', 'CLOSED');

CREATE TABLE "payment_support_requests" (
  "payment_id" UUID NOT NULL,
  "status" "PaymentSupportStatus" NOT NULL DEFAULT 'OPEN',
  "bank_reference" VARCHAR(100),
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolved_at" TIMESTAMPTZ,
  "resolved_by_id" UUID,
  "resolution_note" VARCHAR(300),
  CONSTRAINT "payment_support_requests_pkey" PRIMARY KEY ("payment_id"),
  CONSTRAINT "payment_support_requests_payment_id_fkey"
    FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "payment_support_requests_status_created_at_idx"
  ON "payment_support_requests"("status", "created_at");

ALTER TABLE "bank_transfer_receipts" ALTER COLUMN "provider_id" TYPE VARCHAR(48);
