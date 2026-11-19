
-- MIGRATION 3: AUTH ACCOUNT ONBOARDING
-- Bổ sung xác thực Email, Username và Account action 
-- Bảo toàn dữ liệu hiện có
-- Không xóa User, Order, Inventory hoặc Payment
-- Không thay đổi function, trigger, HNSW index.
-- ============================================================

BEGIN;

-- 1. Tạo Enum phân loại Token
CREATE TYPE "AccountActionPurpose" AS ENUM (
    'EMAIL_VERIFICATION',
    'STAFF_INVITATION',
    'PASSWORD_RESET'
);


-- 2. Bổ sung các cột mới vào bảng Users.
ALTER TABLE "users"
    ADD COLUMN "address" VARCHAR(500),
    ADD COLUMN "avatar_url" VARCHAR(500),
    ADD COLUMN "email_verified_at" TIMESTAMPTZ,
    ADD COLUMN "must_change_password" BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN "username" VARCHAR(100);


-- 3. Sinh Username cho các User đã tồn tại
-- Lấy phần trước @ trong Email và chuyển về chữ thường.
-- ============================================================
UPDATE "users"
SET "username" = LOWER(TRIM(SPLIT_PART("email", '@', 1)));


-- 4. Chuyển đổi trạng thái dữ liệu Demo cũ.
UPDATE "users"
SET "must_change_password" = false;

UPDATE "users"
SET "email_verified_at" = CURRENT_TIMESTAMP
WHERE "role" IN ('CUSTOMER', 'WAREHOUSE_STAFF');


-- 5. Kiểm tra dữ liệu trước khi áp dụng ràng buộc.
-- Nếu có vấn đề, migration sẽ báo lỗi và rollback.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM "users"
        WHERE "username" IS NULL
           OR LENGTH("username") = 0
           OR LENGTH("username") > 100
    ) THEN
        RAISE EXCEPTION
            'Username không hợp lệ: NULL, rỗng hoặc quá 100 ký tự.';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM "users"
        GROUP BY "username"
        HAVING COUNT(*) > 1
    ) THEN
        RAISE EXCEPTION
            'Phát hiện Username trùng nhau.';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM "users"
        WHERE "username" = 'admin'
          AND "role" <> 'ADMIN'
    ) THEN
        RAISE EXCEPTION
            'Username admin đang thuộc tài khoản không phải ADMIN.';
    END IF;
END $$;


-- 6. Sau khi User cũ đã có Username hợp lệ, mới áp dụng NOT NULL và UNIQUE.
ALTER TABLE "users"
ALTER COLUMN "username" SET NOT NULL;

CREATE UNIQUE INDEX "users_username_key"
ON "users"("username");


-- 7. Tạo bảng lưu Token xác thực tài khoản.
CREATE TABLE "account_action_tokens" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "token_hash" VARCHAR(64) NOT NULL,
    "purpose" "AccountActionPurpose" NOT NULL,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "used_at" TIMESTAMPTZ,
    "invalidated_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "account_action_tokens_pkey"
        PRIMARY KEY ("id")
);


-- 8. Tạo index cho AccountActionToken.
CREATE UNIQUE INDEX "account_action_tokens_token_hash_key"
ON "account_action_tokens"("token_hash");

CREATE INDEX "account_action_tokens_user_id_purpose_expires_at_idx"
ON "account_action_tokens"("user_id", "purpose", "expires_at");


-- 9. Tạo foreign key đến users.
ALTER TABLE "account_action_tokens"
ADD CONSTRAINT "account_action_tokens_user_id_fkey"
FOREIGN KEY ("user_id")
REFERENCES "users"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;

COMMIT;