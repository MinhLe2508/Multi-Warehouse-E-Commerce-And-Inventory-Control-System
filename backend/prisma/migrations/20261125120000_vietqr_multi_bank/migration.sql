BEGIN;

-- Existing receipts were all issued for Vietcombank.
ALTER TABLE "bank_transfer_receipts"
  ADD COLUMN "bank_bin" VARCHAR(6) NOT NULL DEFAULT '970436';

CREATE UNIQUE INDEX "bank_transfer_receipts_bank_account_reference_key"
  ON "bank_transfer_receipts"("bank_bin", "account_number", "bank_reference");

DROP INDEX "bank_transfer_receipts_account_number_bank_reference_key";

COMMIT;
