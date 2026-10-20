-- 1. Tao enum neu chua ton tai.
-- Enum nay da duoc tao trong lan migration that bai truoc.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_type t
        JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE n.nspname = 'public'
          AND t.typname = 'NotificationType'
    ) THEN
        CREATE TYPE "NotificationType" AS ENUM (
            'LOW_STOCK',
            'ORDER_UPDATE',
            'SYSTEM'
        );
    END IF;
END $$;

-- 2. Dam bao index HNSW cua chatbot ton tai.
-- Database that hien tai da mat index nay.
-- Shadow database co the da co index tu migration truoc.
CREATE INDEX IF NOT EXISTS "idx_kb_embedding_hnsw"
ON "kb_documents"
USING hnsw ("embedding" vector_cosine_ops);

-- 3. Them gia von o trang thai nullable.
-- Khong tu dong gan gia von gia cho 200 san pham cu.
ALTER TABLE "products"
ADD COLUMN IF NOT EXISTS "cost_price" DECIMAL(14,2);

-- 4. Rang buoc gia von khong am.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'chk_products_cost_price_non_negative'
          AND conrelid = 'public.products'::regclass
    ) THEN
        ALTER TABLE "products"
        ADD CONSTRAINT "chk_products_cost_price_non_negative"
        CHECK ("cost_price" >= 0);
    END IF;
END $$;

-- 5. Tao bang thong bao neu chua ton tai.
CREATE TABLE IF NOT EXISTS "notifications" (
    "id" BIGSERIAL NOT NULL,
    "user_id" UUID NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "body" TEXT NOT NULL,
    "reference_type" VARCHAR(40),
    "reference_id" VARCHAR(64),
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "read_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "notifications_user_id_fkey"
        FOREIGN KEY ("user_id")
        REFERENCES "users"("id")
        ON DELETE CASCADE
        ON UPDATE CASCADE
);

-- 6. Tao cac index cho bang notifications.
CREATE INDEX IF NOT EXISTS
    "notifications_user_id_is_read_created_at_idx"
ON "notifications" ("user_id", "is_read", "created_at");

CREATE INDEX IF NOT EXISTS
    "notifications_reference_type_reference_id_idx"
ON "notifications" ("reference_type", "reference_id");