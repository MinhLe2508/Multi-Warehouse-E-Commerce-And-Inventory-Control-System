ALTER TABLE "users" ADD COLUMN "session_version" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "user_role_changes" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "actor_id" UUID NOT NULL,
  "from_role" "UserRole" NOT NULL,
  "to_role" "UserRole" NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "user_role_changes_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "user_role_changes_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "user_role_changes_actor_id_fkey"
    FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "user_role_changes_user_id_created_at_idx" ON "user_role_changes"("user_id", "created_at");
CREATE INDEX "user_role_changes_actor_id_idx" ON "user_role_changes"("actor_id");
