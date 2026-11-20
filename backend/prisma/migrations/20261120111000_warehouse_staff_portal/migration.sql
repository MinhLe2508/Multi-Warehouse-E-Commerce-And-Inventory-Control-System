BEGIN;

CREATE TABLE "warehouse_staff_assignments" (
  "user_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "warehouse_id" UUID NOT NULL REFERENCES "warehouses"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "assigned_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "warehouse_staff_assignments_pkey" PRIMARY KEY ("user_id", "warehouse_id")
);
CREATE INDEX "warehouse_staff_assignments_warehouse_id_idx"
  ON "warehouse_staff_assignments" ("warehouse_id");
CREATE INDEX "order_items_warehouse_id_order_id_idx" ON "order_items" ("warehouse_id", "order_id");
CREATE INDEX "order_status_history_to_status_created_at_idx" ON "order_status_history" ("to_status", "created_at");

ALTER TABLE "notifications" ADD COLUMN "warehouse_id" UUID
  REFERENCES "warehouses" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "notifications_warehouse_id_idx" ON "notifications" ("warehouse_id");

UPDATE "notifications" n SET "warehouse_id" = i."warehouse_id"
  FROM "stock_alerts" a JOIN "inventory" i ON i."id" = a."inventory_id"
 WHERE n."reference_type" = 'StockAlert' AND n."reference_id" = a."id"::text
   AND n."type" = 'LOW_STOCK';

INSERT INTO "warehouse_staff_assignments" ("user_id", "warehouse_id")
SELECT u."id", w."id" FROM "users" u CROSS JOIN "warehouses" w
 WHERE u."username" = 'staff' AND u."email" = 'staff@demo.example.test'
   AND u."role" = 'WAREHOUSE_STAFF' AND w."is_active"
   AND w."code" IN ('WH-HN01', 'WH-HCM01');

CREATE UNIQUE INDEX "staff_restock_request_key"
  ON "inventory_audit_log" ("actor_id", "reference_id")
  WHERE "reference_type" = 'STAFF_RESTOCK' AND "reference_id" IS NOT NULL;

COMMIT;
