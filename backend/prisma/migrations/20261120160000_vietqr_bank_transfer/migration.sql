ALTER TYPE "PaymentMethod" ADD VALUE 'BANK_TRANSFER';

CREATE TABLE "bank_transfer_receipts" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "payment_id" UUID NOT NULL,
  "account_number" VARCHAR(19) NOT NULL,
  "bank_reference" VARCHAR(100),
  "provider_id" VARCHAR(32),
  "received_at" TIMESTAMPTZ NOT NULL,
  "amount" DECIMAL(14, 2) NOT NULL CHECK ("amount" > 0),
  "issue" VARCHAR(32),
  "actor_id" UUID,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "bank_transfer_receipts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "bank_transfer_receipts_payment_id_fkey"
    FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "chk_bank_receipt_identity" CHECK ("bank_reference" IS NOT NULL OR "provider_id" IS NOT NULL)
);

CREATE UNIQUE INDEX "bank_transfer_receipts_account_number_bank_reference_key"
  ON "bank_transfer_receipts"("account_number", "bank_reference");
CREATE UNIQUE INDEX "bank_transfer_receipts_provider_id_key"
  ON "bank_transfer_receipts"("provider_id");
CREATE INDEX "bank_transfer_receipts_payment_id_received_at_idx"
  ON "bank_transfer_receipts"("payment_id", "received_at");
