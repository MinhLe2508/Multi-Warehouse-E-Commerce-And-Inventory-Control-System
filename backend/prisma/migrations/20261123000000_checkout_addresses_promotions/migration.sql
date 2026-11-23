ALTER TYPE "NotificationType" ADD VALUE 'PROMOTION';

CREATE TABLE "favorite_addresses" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "label" VARCHAR(80) NOT NULL,
  "recipient" VARCHAR(150) NOT NULL,
  "phone" VARCHAR(20) NOT NULL,
  "address" VARCHAR(500) NOT NULL,
  "warehouse_id" UUID,
  "is_default" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "favorite_addresses_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "favorite_addresses_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "favorite_addresses_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "favorite_addresses_user_id_created_at_idx" ON "favorite_addresses"("user_id", "created_at");
CREATE UNIQUE INDEX "favorite_addresses_one_default_per_user" ON "favorite_addresses"("user_id") WHERE "is_default";

CREATE TABLE "promotions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "code" VARCHAR(5) NOT NULL,
  "name" VARCHAR(150) NOT NULL,
  "percent" INTEGER NOT NULL CHECK ("percent" BETWEEN 1 AND 100),
  "all_categories" BOOLEAN NOT NULL,
  "expires_at" TIMESTAMPTZ NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deleted_at" TIMESTAMPTZ,
  CONSTRAINT "promotions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "promotions_code_format" CHECK ("code" ~ '^[A-Z0-9]{5}$')
);
CREATE UNIQUE INDEX "promotions_code_key" ON "promotions"("code");
CREATE INDEX "promotions_deleted_at_expires_at_idx" ON "promotions"("deleted_at", "expires_at");

CREATE TABLE "promotion_categories" (
  "promotion_id" UUID NOT NULL,
  "category_id" UUID NOT NULL,
  CONSTRAINT "promotion_categories_pkey" PRIMARY KEY ("promotion_id", "category_id"),
  CONSTRAINT "promotion_categories_promotion_id_fkey" FOREIGN KEY ("promotion_id") REFERENCES "promotions"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "promotion_categories_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "promotion_categories_category_id_idx" ON "promotion_categories"("category_id");

CREATE TABLE "promotion_claims" (
  "user_id" UUID NOT NULL,
  "promotion_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "promotion_claims_pkey" PRIMARY KEY ("user_id", "promotion_id"),
  CONSTRAINT "promotion_claims_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "promotion_claims_promotion_id_fkey" FOREIGN KEY ("promotion_id") REFERENCES "promotions"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "promotion_claims_promotion_id_idx" ON "promotion_claims"("promotion_id");

ALTER TABLE "orders"
  ADD COLUMN "shipping_warehouse_id" UUID,
  ADD COLUMN "promotion_id" UUID,
  ADD COLUMN "promotion_code" VARCHAR(5),
  ADD COLUMN "promotion_discount_total" DECIMAL(14, 2) NOT NULL DEFAULT 0,
  ADD CONSTRAINT "orders_shipping_warehouse_id_fkey" FOREIGN KEY ("shipping_warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "orders_promotion_id_fkey" FOREIGN KEY ("promotion_id") REFERENCES "promotions"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "orders_promotion_discount_total_check" CHECK ("promotion_discount_total" BETWEEN 0 AND "discount_total");

CREATE INDEX "orders_shipping_warehouse_id_created_at_idx" ON "orders"("shipping_warehouse_id", "created_at");
CREATE INDEX "orders_promotion_id_idx" ON "orders"("promotion_id");
