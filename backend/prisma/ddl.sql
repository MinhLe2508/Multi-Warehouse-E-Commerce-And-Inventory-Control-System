-- =============================================================
-- Multi-Warehouse E-Commerce & Inventory Control System
-- Topic 3 - Course ID 502045
-- PostgreSQL 16.15+ / DDL đầy đủ (18 bảng, 10 ENUM, 25 FK, 20 CHECK + 1 đã gỡ ở mục 9.4, 62 Index)
-- Kèm hàm giữ chỗ tồn kho fn_reserve_stock() và trigger kiểm tra bất biến (Mục 10.1 & 10.2)
-- Chạy với cờ: psql -v ON_ERROR_STOP=1 -f backend/prisma/ddl.sql
-- =============================================================

-- ---------- 0. EXTENSIONS ----------
CREATE EXTENSION IF NOT EXISTS "pgcrypto";   -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "vector";     -- pgvector cho AI Chatbot RAG
CREATE EXTENSION IF NOT EXISTS "pg_trgm";    -- tăng tốc tìm kiếm tên sản phẩm (FR-CAT-01)

-- ---------- 1. ENUM TYPES (10 ENUM) ----------
CREATE TYPE user_role               AS ENUM ('CUSTOMER','WAREHOUSE_STAFF','ADMIN');
CREATE TYPE order_status            AS ENUM ('PENDING_PAYMENT','CONFIRMED','SHIPPING','DELIVERED','CANCELLED');
CREATE TYPE reservation_status      AS ENUM ('HOLDING','COMMITTED','RELEASED','EXPIRED');
CREATE TYPE payment_status          AS ENUM ('PENDING','SUCCESS','FAILED');
CREATE TYPE payment_method          AS ENUM ('MOCK_CARD','MOCK_EWALLET','COD');
CREATE TYPE alert_level             AS ENUM ('WARNING','CRITICAL');
CREATE TYPE alert_status            AS ENUM ('OPEN','RESOLVED');
CREATE TYPE inventory_change_reason AS ENUM ('RESERVE','COMMIT','RELEASE','EXPIRE','RESTOCK','MANUAL_ADJUST');
CREATE TYPE chat_role               AS ENUM ('USER','ASSISTANT','SYSTEM');
CREATE TYPE cart_status             AS ENUM ('ACTIVE','CONVERTED','ABANDONED');

-- =============================================================
-- NHÓM A: IDENTITY & ACCESS  (P4)
-- =============================================================
CREATE TABLE users (
    id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    email         VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    full_name     VARCHAR(150) NOT NULL,
    phone         VARCHAR(20),
    role          user_role    NOT NULL DEFAULT 'CUSTOMER',
    is_active     BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_users_email_format CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$')
);
CREATE INDEX idx_users_role ON users(role) WHERE is_active = TRUE;

CREATE TABLE refresh_tokens (
    id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash  VARCHAR(255) NOT NULL UNIQUE,
    expires_at  TIMESTAMPTZ  NOT NULL,
    revoked_at  TIMESTAMPTZ,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_refresh_user_active ON refresh_tokens(user_id) WHERE revoked_at IS NULL;

-- =============================================================
-- NHÓM B: CATALOG  (P4)
-- =============================================================
CREATE TABLE categories (
    id         UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    name       VARCHAR(150) NOT NULL,
    slug       VARCHAR(160) NOT NULL UNIQUE,
    parent_id  UUID         REFERENCES categories(id) ON DELETE SET NULL,
    is_active  BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_categories_no_self_parent CHECK (parent_id IS NULL OR parent_id <> id)
);
CREATE INDEX idx_categories_parent ON categories(parent_id);

CREATE TABLE products (
    id               UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    sku              VARCHAR(64)   NOT NULL UNIQUE,
    name             VARCHAR(255)  NOT NULL,
    slug             VARCHAR(280)  NOT NULL UNIQUE,
    description      TEXT,
    base_price       NUMERIC(14,2) NOT NULL,
    discount_percent NUMERIC(5,2)  NOT NULL DEFAULT 0,
    category_id      UUID          REFERENCES categories(id) ON DELETE SET NULL,
    image_url        VARCHAR(500),
    is_active        BOOLEAN       NOT NULL DEFAULT TRUE,
    created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_products_price_positive CHECK (base_price >= 0),
    CONSTRAINT chk_products_discount_range CHECK (discount_percent >= 0 AND discount_percent <= 100)
);
CREATE INDEX idx_products_category  ON products(category_id) WHERE is_active = TRUE;
CREATE INDEX idx_products_price     ON products(base_price)  WHERE is_active = TRUE;
CREATE INDEX idx_products_name_trgm ON products USING gin (name gin_trgm_ops);

-- =============================================================
-- NHÓM C: WAREHOUSE & INVENTORY  (P4)  -- LÕI KỸ THUẬT
-- =============================================================
CREATE TABLE warehouses (
    id                          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    code                        VARCHAR(32)  NOT NULL UNIQUE,
    name                        VARCHAR(150) NOT NULL,
    region                      VARCHAR(100) NOT NULL,
    address                     VARCHAR(500),
    capacity                    INTEGER,
    default_low_stock_threshold INTEGER      NOT NULL DEFAULT 10,
    is_active                   BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at                  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at                  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_wh_threshold_nonneg CHECK (default_low_stock_threshold >= 0),
    CONSTRAINT chk_wh_capacity_pos     CHECK (capacity IS NULL OR capacity > 0)
);
CREATE INDEX idx_warehouses_region ON warehouses(region) WHERE is_active = TRUE;

-- BẢNG TRUNG TÂM: hiện thực quan hệ N-N products <-> warehouses
CREATE TABLE inventory (
    id                BIGSERIAL   PRIMARY KEY,
    product_id        UUID        NOT NULL REFERENCES products(id)   ON DELETE CASCADE,
    warehouse_id      UUID        NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
    stock             INTEGER     NOT NULL DEFAULT 0,
    reserved_stock    INTEGER     NOT NULL DEFAULT 0,
    available_stock   INTEGER     GENERATED ALWAYS AS (stock - reserved_stock) STORED,
    threshold         INTEGER,
    version           INTEGER     NOT NULL DEFAULT 0,
    last_restocked_at TIMESTAMPTZ,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- RÀNG BUỘC SỐNG CÒN: một cặp (sản phẩm, kho) chỉ tồn tại DUY NHẤT 1 dòng
    CONSTRAINT uq_inventory_product_warehouse UNIQUE (product_id, warehouse_id),

    -- 3 CHECK constraint chống oversell ở tầng CSDL (lớp bảo vệ cuối cùng)
    CONSTRAINT chk_inv_stock_nonneg      CHECK (stock >= 0),
    CONSTRAINT chk_inv_reserved_nonneg   CHECK (reserved_stock >= 0),
    CONSTRAINT chk_inv_reserved_le_stock CHECK (reserved_stock <= stock),
    CONSTRAINT chk_inv_threshold_nonneg  CHECK (threshold IS NULL OR threshold >= 0)
);
CREATE INDEX idx_inventory_product   ON inventory(product_id);
CREATE INDEX idx_inventory_warehouse ON inventory(warehouse_id);
-- Phục vụ FR-CAT-01 (lọc sản phẩm còn hàng) và FR-NOT-01 (quét low-stock)
CREATE INDEX idx_inventory_available ON inventory(available_stock) WHERE available_stock > 0;
CREATE INDEX idx_inventory_lowstock  ON inventory(warehouse_id, available_stock);

CREATE TABLE inventory_audit_log (
    id              BIGSERIAL               PRIMARY KEY,
    inventory_id    BIGINT                  NOT NULL REFERENCES inventory(id) ON DELETE CASCADE,
    reason          inventory_change_reason NOT NULL,
    stock_before    INTEGER                 NOT NULL,
    stock_after     INTEGER                 NOT NULL,
    reserved_before INTEGER                 NOT NULL,
    reserved_after  INTEGER                 NOT NULL,
    quantity_delta  INTEGER                 NOT NULL,
    reference_type  VARCHAR(40),
    reference_id    VARCHAR(64),
    actor_id        UUID                    REFERENCES users(id) ON DELETE SET NULL,
    note            VARCHAR(500),
    created_at      TIMESTAMPTZ             NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_audit_inventory_time ON inventory_audit_log(inventory_id, created_at DESC);
CREATE INDEX idx_audit_reference      ON inventory_audit_log(reference_type, reference_id);

-- =============================================================
-- NHÓM D: CART  (P1)  -- TÙY CHỌN nếu chốt giỏ hàng server-side
-- =============================================================
CREATE TABLE carts (
    id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status     cart_status NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- Mỗi user chỉ có tối đa 1 giỏ ACTIVE
CREATE UNIQUE INDEX uq_carts_one_active_per_user ON carts(user_id) WHERE status = 'ACTIVE';

CREATE TABLE cart_items (
    id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    cart_id    UUID        NOT NULL REFERENCES carts(id)    ON DELETE CASCADE,
    product_id UUID        NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    quantity   INTEGER     NOT NULL DEFAULT 1,
    added_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_cart_items_cart_product UNIQUE (cart_id, product_id),
    CONSTRAINT chk_cart_items_qty_pos     CHECK (quantity > 0)
);

-- =============================================================
-- NHÓM E: ORDER & RESERVATION  (P3)  -- LÕI KỸ THUẬT
-- =============================================================
CREATE TABLE orders (
    id                     UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    order_code             VARCHAR(32)   NOT NULL UNIQUE,
    user_id                UUID          NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    status                 order_status  NOT NULL DEFAULT 'PENDING_PAYMENT',
    subtotal               NUMERIC(14,2) NOT NULL DEFAULT 0,
    discount_total         NUMERIC(14,2) NOT NULL DEFAULT 0,
    shipping_fee           NUMERIC(14,2) NOT NULL DEFAULT 0,
    grand_total            NUMERIC(14,2) NOT NULL DEFAULT 0,
    currency               CHAR(3)       NOT NULL DEFAULT 'VND',
    shipping_recipient     VARCHAR(150)  NOT NULL,
    shipping_phone         VARCHAR(20)   NOT NULL,
    shipping_address       VARCHAR(500)  NOT NULL,
    shipping_region        VARCHAR(100),
    reservation_expires_at TIMESTAMPTZ,
    cancelled_reason       VARCHAR(255),
    confirmed_at           TIMESTAMPTZ,
    cancelled_at           TIMESTAMPTZ,
    created_at             TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at             TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_orders_amounts_nonneg CHECK (
        subtotal >= 0 AND discount_total >= 0 AND shipping_fee >= 0 AND grand_total >= 0
    ),
    CONSTRAINT chk_orders_grand_total CHECK (
        grand_total = subtotal - discount_total + shipping_fee
    )
);
-- FR-ORD-03: lấy đơn của chính user, mới nhất trước
CREATE INDEX idx_orders_user_time   ON orders(user_id, created_at DESC);
CREATE INDEX idx_orders_status      ON orders(status);
-- FR-DASH-02: báo cáo doanh thu theo khoảng thời gian
CREATE INDEX idx_orders_status_time ON orders(status, created_at);

CREATE TABLE order_items (
    id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id        UUID          NOT NULL REFERENCES orders(id)     ON DELETE CASCADE,
    product_id      UUID          NOT NULL REFERENCES products(id)   ON DELETE RESTRICT,
    warehouse_id    UUID          NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
    inventory_id    BIGINT        NOT NULL REFERENCES inventory(id)  ON DELETE RESTRICT,
    product_name    VARCHAR(255)  NOT NULL,
    sku             VARCHAR(64)   NOT NULL,
    unit_price      NUMERIC(14,2) NOT NULL,
    discount_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
    quantity        INTEGER       NOT NULL,
    line_total      NUMERIC(14,2) NOT NULL,
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_oi_qty_pos      CHECK (quantity > 0),
    CONSTRAINT chk_oi_price_nonneg CHECK (unit_price >= 0 AND discount_amount >= 0),
    CONSTRAINT chk_oi_line_total   CHECK (line_total = unit_price * quantity - discount_amount)
);
CREATE INDEX idx_order_items_order     ON order_items(order_id);
CREATE INDEX idx_order_items_product   ON order_items(product_id);
CREATE INDEX idx_order_items_warehouse ON order_items(warehouse_id);

-- BẢNG CHỐNG OVERSELL
CREATE TABLE stock_reservations (
    id            BIGSERIAL          PRIMARY KEY,
    order_id      UUID               NOT NULL REFERENCES orders(id)      ON DELETE CASCADE,
    order_item_id UUID                        REFERENCES order_items(id) ON DELETE CASCADE,
    inventory_id  BIGINT             NOT NULL REFERENCES inventory(id)   ON DELETE RESTRICT,
    quantity      INTEGER            NOT NULL,
    status        reservation_status NOT NULL DEFAULT 'HOLDING',
    expires_at    TIMESTAMPTZ        NOT NULL,
    committed_at  TIMESTAMPTZ,
    released_at   TIMESTAMPTZ,
    created_at    TIMESTAMPTZ        NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ        NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_res_qty_pos CHECK (quantity > 0)
    -- MỤC 9.4: KHÔNG đặt CHECK (expires_at > created_at) vì sẽ chặn test fixture của NFR-04.3
    -- (cần lùi expires_at về quá khứ để mô phỏng reservation hết hạn trong integration test).
);
-- INDEX QUAN TRỌNG NHẤT cho cron job FR-ORD-04 (quét reservation hết hạn mỗi phút)
CREATE INDEX idx_res_cleanup   ON stock_reservations(expires_at) WHERE status = 'HOLDING';
CREATE INDEX idx_res_order     ON stock_reservations(order_id);
CREATE INDEX idx_res_inventory ON stock_reservations(inventory_id, status);

CREATE TABLE order_status_history (
    id          BIGSERIAL    PRIMARY KEY,
    order_id    UUID         NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    from_status order_status,
    to_status   order_status NOT NULL,
    actor_id    UUID         REFERENCES users(id) ON DELETE SET NULL,
    reason      VARCHAR(255),
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_osh_status_changed CHECK (from_status IS NULL OR from_status <> to_status)
);
CREATE INDEX idx_osh_order_time ON order_status_history(order_id, created_at);

-- =============================================================
-- NHÓM F: PAYMENT  (P3)
-- =============================================================
CREATE TABLE payments (
    id               UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id         UUID           NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
    -- KHÓA IDEMPOTENCY: UNIQUE bảo đảm callback lặp không thể tạo giao dịch thứ 2
    transaction_ref  VARCHAR(64)    NOT NULL UNIQUE,
    amount           NUMERIC(14,2)  NOT NULL,
    currency         CHAR(3)        NOT NULL DEFAULT 'VND',
    method           payment_method NOT NULL,
    status           payment_status NOT NULL DEFAULT 'PENDING',
    failure_reason   VARCHAR(255),
    gateway_response JSONB,
    callback_count   INTEGER        NOT NULL DEFAULT 0,
    processed_at     TIMESTAMPTZ,
    created_at       TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_pay_amount_pos     CHECK (amount > 0),
    CONSTRAINT chk_pay_callback_count CHECK (callback_count >= 0)
);
CREATE INDEX idx_payments_order  ON payments(order_id);
CREATE INDEX idx_payments_status ON payments(status);
-- Mỗi đơn chỉ có TỐI ĐA 1 giao dịch SUCCESS -> chặn double-charge ở tầng CSDL
CREATE UNIQUE INDEX uq_payments_one_success_per_order
    ON payments(order_id) WHERE status = 'SUCCESS';

-- =============================================================
-- NHÓM G: NOTIFICATION  (P5)
-- =============================================================
CREATE TABLE stock_alerts (
    id                   BIGSERIAL    PRIMARY KEY,
    inventory_id         BIGINT       NOT NULL REFERENCES inventory(id) ON DELETE CASCADE,
    alert_level          alert_level  NOT NULL DEFAULT 'WARNING',
    status               alert_status NOT NULL DEFAULT 'OPEN',
    stock_at_trigger     INTEGER      NOT NULL,
    available_at_trigger INTEGER      NOT NULL,
    threshold_at_trigger INTEGER      NOT NULL,
    triggered_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    resolved_at          TIMESTAMPTZ,
    resolved_by          UUID         REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX idx_alerts_open ON stock_alerts(triggered_at DESC) WHERE status = 'OPEN';
-- Chống spam: mỗi dòng tồn kho chỉ có tối đa 1 cảnh báo OPEN cùng lúc (FR-NOT-01)
CREATE UNIQUE INDEX uq_alerts_one_open_per_inventory
    ON stock_alerts(inventory_id) WHERE status = 'OPEN';

-- =============================================================
-- NHÓM H: AI CHATBOT (RAG)  (P5)
-- =============================================================
CREATE TABLE kb_documents (
    id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    title       VARCHAR(255) NOT NULL,
    doc_type    VARCHAR(50)  NOT NULL,
    chunk_index INTEGER      NOT NULL DEFAULT 0,
    content     TEXT         NOT NULL,
    embedding   vector(1024),
    token_count INTEGER,
    source_url  VARCHAR(500),
    is_active   BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
-- Index vector cho semantic search (cosine distance).
CREATE INDEX idx_kb_embedding_hnsw ON kb_documents
    USING hnsw (embedding vector_cosine_ops);
CREATE INDEX idx_kb_doctype ON kb_documents(doc_type) WHERE is_active = TRUE;

CREATE TABLE chat_sessions (
    id                 UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id            UUID         REFERENCES users(id) ON DELETE SET NULL,
    session_token      VARCHAR(100) NOT NULL UNIQUE,
    escalated_to_human BOOLEAN      NOT NULL DEFAULT FALSE,
    message_count      INTEGER      NOT NULL DEFAULT 0,
    started_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    ended_at           TIMESTAMPTZ
);
CREATE INDEX idx_chat_sessions_user ON chat_sessions(user_id, started_at DESC);

CREATE TABLE chat_messages (
    id                BIGSERIAL   PRIMARY KEY,
    session_id        UUID        NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
    role              chat_role   NOT NULL,
    content           TEXT        NOT NULL,
    retrieved_context JSONB,
    tool_calls        JSONB,
    is_fallback       BOOLEAN     NOT NULL DEFAULT FALSE,
    latency_ms        INTEGER,
    token_usage       INTEGER,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_chat_messages_session ON chat_messages(session_id, created_at);

-- =============================================================
-- TRIGGER: tự động cập nhật updated_at (11 bảng)
-- =============================================================
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

-- =============================================================
-- TRIGGER: tăng version mỗi khi inventory bị cập nhật
-- (hỗ trợ optimistic locking dự phòng - defense in depth)
-- =============================================================
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

-- =============================================================
-- 10.2. HÀM GIỮ CHỖ TỒN KHO - bản cài đặt ĐÚNG của FR-ORD-02
-- Đã kiểm chứng bằng test song song trên PostgreSQL 16.15
-- =============================================================
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
    -- B1: KHÓA DÒNG (pessimistic lock).
    -- Mọi transaction khác chạm tới dòng này sẽ phải CHỜ tại đây.
    -- Caller BẮT BUỘC gọi hàm này theo thứ tự inventory_id TĂNG DẦN
    -- khi một đơn hàng có nhiều sản phẩm -> không bao giờ deadlock.
    SELECT available_stock INTO v_available
      FROM inventory
     WHERE id = p_inventory_id
       FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'INVENTORY_NOT_FOUND' USING ERRCODE = 'P0002';
    END IF;

    -- B2: KIỂM TRA ĐỦ HÀNG.
    -- Không đủ -> NÉM LỖI để PostgreSQL rollback TOÀN BỘ transaction.
    -- Đây là bước mà cách viết trực giác hay bỏ sót, sinh ra "reservation ma".
    IF v_available < p_quantity THEN
        RAISE EXCEPTION 'INSUFFICIENT_STOCK: con % can %', v_available, p_quantity
              USING ERRCODE = '23514';   -- NestJS map sang 409 Conflict
    END IF;

    -- B3: Tăng reserved_stock (KHÔNG trừ stock thật ở bước này)
    UPDATE inventory
       SET reserved_stock = reserved_stock + p_quantity
     WHERE id = p_inventory_id;

    -- B4: Tạo bản ghi giữ chỗ có thời hạn
    INSERT INTO stock_reservations (order_id, inventory_id, quantity, status, expires_at)
    VALUES (p_order_id, p_inventory_id, p_quantity, 'HOLDING',
            NOW() + make_interval(mins => p_ttl_minutes))
    RETURNING id INTO v_res_id;

    RETURN v_res_id;
END;
$$ LANGUAGE plpgsql;

-- =============================================================
-- LỚP BẢO VỆ CUỐI CÙNG: trigger kiểm tra bất biến
-- Bắt trường hợp tổng reservation HOLDING > reserved_stock
-- (chính là lỗi "reservation ma" đã phát hiện ở mục 9.2)
-- DEFERRABLE INITIALLY DEFERRED -> chỉ kiểm tra ở thời điểm COMMIT,
-- nên không cản trở các bước trung gian trong cùng transaction.
-- =============================================================
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
