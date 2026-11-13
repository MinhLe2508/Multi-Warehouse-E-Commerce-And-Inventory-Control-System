CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Kiểm tra Constraint — Lớp bảo vệ cuối cùng chống Oversell ở tầng CSDL
ALTER TABLE "inventory" ADD CONSTRAINT "chk_inv_stock_nonneg" CHECK ("stock" >= 0);
ALTER TABLE "inventory" ADD CONSTRAINT "chk_inv_reserved_nonneg" CHECK ("reserved_stock" >= 0);
ALTER TABLE "inventory" ADD CONSTRAINT "chk_inv_reserved_le_stock" CHECK ("reserved_stock" <= "stock");
ALTER TABLE "inventory" ADD CONSTRAINT "chk_inv_threshold_nonneg" CHECK ("threshold" IS NULL OR "threshold" >= 0);

ALTER TABLE "users" ADD CONSTRAINT "chk_users_email_format"
    CHECK ("email" ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$');

ALTER TABLE "categories" ADD CONSTRAINT "chk_categories_no_self_parent"
    CHECK ("parent_id" IS NULL OR "parent_id" <> "id");

ALTER TABLE "products" ADD CONSTRAINT "chk_products_price_positive" CHECK ("base_price" >= 0);
ALTER TABLE "products" ADD CONSTRAINT "chk_products_discount_range"
    CHECK ("discount_percent" >= 0 AND "discount_percent" <= 100);

ALTER TABLE "warehouses" ADD CONSTRAINT "chk_wh_threshold_nonneg" CHECK ("default_low_stock_threshold" >= 0);
ALTER TABLE "warehouses" ADD CONSTRAINT "chk_wh_capacity_pos" CHECK ("capacity" IS NULL OR "capacity" > 0);

ALTER TABLE "cart_items" ADD CONSTRAINT "chk_cart_items_qty_pos" CHECK ("quantity" > 0);

ALTER TABLE "orders" ADD CONSTRAINT "chk_orders_amounts_nonneg"
    CHECK ("subtotal" >= 0 AND "discount_total" >= 0 AND "shipping_fee" >= 0 AND "grand_total" >= 0);
ALTER TABLE "orders" ADD CONSTRAINT "chk_orders_grand_total"
    CHECK ("grand_total" = "subtotal" - "discount_total" + "shipping_fee");

ALTER TABLE "order_items" ADD CONSTRAINT "chk_oi_qty_pos" CHECK ("quantity" > 0);
ALTER TABLE "order_items" ADD CONSTRAINT "chk_oi_price_nonneg"
    CHECK ("unit_price" >= 0 AND "discount_amount" >= 0);
ALTER TABLE "order_items" ADD CONSTRAINT "chk_oi_line_total"
    CHECK ("line_total" = "unit_price" * "quantity" - "discount_amount");

ALTER TABLE "stock_reservations" ADD CONSTRAINT "chk_res_qty_pos" CHECK ("quantity" > 0);

ALTER TABLE "order_status_history" ADD CONSTRAINT "chk_osh_status_changed"
    CHECK ("from_status" IS NULL OR "from_status" <> "to_status");

ALTER TABLE "payments" ADD CONSTRAINT "chk_pay_amount_pos" CHECK ("amount" > 0);
ALTER TABLE "payments" ADD CONSTRAINT "chk_pay_callback_count" CHECK ("callback_count" >= 0);


-- UNIQUE INDEX có điều kiện
-- Mỗi User chỉ có tối đa 1 giỏ hàng đang ACTIVE cùng lúc
CREATE UNIQUE INDEX "uq_carts_one_active_per_user" ON "carts"("user_id") WHERE "status" = 'ACTIVE';

-- Mỗi đơn hàng chỉ có thể có 1 giao dịch thanh toán thành công, để tránh việc khách hàng bị trừ tiền nhiều lần cho cùng một đơn hàng.
CREATE UNIQUE INDEX "uq_payments_one_success_per_order" ON "payments"("order_id") WHERE "status" = 'SUCCESS';

-- Mỗi dòng ton kho chỉ có tối đa 1 cảnh báo đang OPEN cùng lúc, chống spam cảnh báo
CREATE UNIQUE INDEX "uq_alerts_one_open_per_inventory" ON "stock_alerts"("inventory_id") WHERE "status" = 'OPEN';


-- Index có điều kiện
CREATE INDEX "idx_res_cleanup" ON "stock_reservations"("expires_at") WHERE "status" = 'HOLDING';

-- Index cho vector embedding (hnsw) trong kb_documents
CREATE INDEX "idx_kb_embedding_hnsw" ON "kb_documents" USING hnsw ("embedding" vector_cosine_ops);


-- Trigger tự động cập nhật cột updated_at khi row bị UPDATE
CREATE OR REPLACE FUNCTION trg_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'users','categories','products','warehouses','inventory',
        'carts','cart_items','orders','stock_reservations','payments',
        'kb_documents'
    ]
    LOOP
        EXECUTE format(
            'CREATE TRIGGER set_updated_at BEFORE UPDATE ON %I
             FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();', t);
    END LOOP;
END $$;

CREATE OR REPLACE FUNCTION trg_inventory_bump_version()
RETURNS TRIGGER AS $$
BEGIN
    NEW.version = OLD.version + 1;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER inventory_bump_version
    BEFORE UPDATE OF stock, reserved_stock ON inventory
    FOR EACH ROW EXECUTE FUNCTION trg_inventory_bump_version();


-- Chống oversell: hàm giữ hàng (reserve stock) cho 1 đơn hàng, có thời hạn TTL.
CREATE OR REPLACE FUNCTION fn_reserve_stock(
    p_inventory_id BIGINT,
    p_order_id     UUID,
    p_quantity     INTEGER,
    p_ttl_minutes  INTEGER DEFAULT 15
) RETURNS BIGINT AS $$
DECLARE
    v_available INTEGER;
    v_res_id    BIGINT;
BEGIN
    SELECT available_stock INTO v_available
      FROM inventory
     WHERE id = p_inventory_id
       FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'INVENTORY_NOT_FOUND' USING ERRCODE = 'P0002';
    END IF;

    IF v_available < p_quantity THEN
        RAISE EXCEPTION 'INSUFFICIENT_STOCK: con % can %', v_available, p_quantity
              USING ERRCODE = '23514';
    END IF;

    UPDATE inventory
       SET reserved_stock = reserved_stock + p_quantity
     WHERE id = p_inventory_id;

    INSERT INTO stock_reservations (order_id, inventory_id, quantity, status, expires_at, updated_at)
    VALUES (p_order_id, p_inventory_id, p_quantity, 'HOLDING',
            NOW() + make_interval(mins => p_ttl_minutes), NOW())
    RETURNING id INTO v_res_id;

    RETURN v_res_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION trg_check_reservation_consistency()
RETURNS TRIGGER AS $$
DECLARE
    v_sum_holding INTEGER;
    v_reserved    INTEGER;
BEGIN
    SELECT COALESCE(SUM(quantity), 0) INTO v_sum_holding
      FROM stock_reservations
     WHERE inventory_id = NEW.inventory_id AND status = 'HOLDING';

    SELECT reserved_stock INTO v_reserved
      FROM inventory WHERE id = NEW.inventory_id;

    IF v_sum_holding > v_reserved THEN
        RAISE EXCEPTION
          'RESERVATION_INCONSISTENT: tong giu cho (%) > reserved_stock (%) tren inventory_id=%',
          v_sum_holding, v_reserved, NEW.inventory_id
          USING ERRCODE = '23514';
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER ctrg_reservation_consistency
    AFTER INSERT OR UPDATE ON stock_reservations
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION trg_check_reservation_consistency();