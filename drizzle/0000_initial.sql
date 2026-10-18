CREATE TABLE "workspaces" (
  "id" uuid PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "key_hash" varchar(64) NOT NULL UNIQUE,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE "users" (
  "id" uuid PRIMARY KEY NOT NULL,
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "display_name" text NOT NULL,
  "email" text NOT NULL,
  "role" text NOT NULL,
  "token_hash" varchar(64) NOT NULL UNIQUE,
  CONSTRAINT "users_workspace_id_id_unique" UNIQUE ("workspace_id", "id"),
  CONSTRAINT "users_workspace_email_unique" UNIQUE ("workspace_id", "email"),
  CONSTRAINT "users_role_check" CHECK ("role" IN ('student', 'advisor'))
);
CREATE TABLE "services" (
  "id" uuid PRIMARY KEY NOT NULL,
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "description" text NOT NULL,
  "eligibility" text NOT NULL,
  "booking_instructions" text NOT NULL,
  "publication_status" text NOT NULL,
  CONSTRAINT "services_workspace_id_id_unique" UNIQUE ("workspace_id", "id"),
  CONSTRAINT "services_publication_status_check" CHECK ("publication_status" IN ('draft', 'published'))
);
CREATE TABLE "slots" (
  "id" uuid PRIMARY KEY NOT NULL,
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "service_id" uuid NOT NULL,
  "advisor_id" uuid NOT NULL,
  "starts_at" timestamptz NOT NULL,
  "ends_at" timestamptz NOT NULL,
  "room" text,
  "status" text NOT NULL,
  "internal_note" text,
  CONSTRAINT "slots_workspace_id_id_unique" UNIQUE ("workspace_id", "id"),
  CONSTRAINT "slots_workspace_service_fk" FOREIGN KEY ("workspace_id", "service_id")
    REFERENCES "services"("workspace_id", "id") ON DELETE CASCADE,
  CONSTRAINT "slots_workspace_advisor_fk" FOREIGN KEY ("workspace_id", "advisor_id")
    REFERENCES "users"("workspace_id", "id") ON DELETE CASCADE,
  CONSTRAINT "slots_status_check" CHECK ("status" IN ('open', 'closed')),
  CONSTRAINT "slots_time_order_check" CHECK ("ends_at" > "starts_at")
);
CREATE INDEX "slots_workspace_starts_idx" ON "slots" ("workspace_id", "starts_at", "id");
CREATE TABLE "bookings" (
  "id" uuid PRIMARY KEY NOT NULL,
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "student_id" uuid NOT NULL,
  "slot_id" uuid NOT NULL,
  "status" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "canceled_at" timestamptz,
  "private_note" text,
  CONSTRAINT "bookings_workspace_id_id_unique" UNIQUE ("workspace_id", "id"),
  CONSTRAINT "bookings_workspace_student_fk" FOREIGN KEY ("workspace_id", "student_id")
    REFERENCES "users"("workspace_id", "id") ON DELETE CASCADE,
  CONSTRAINT "bookings_workspace_slot_fk" FOREIGN KEY ("workspace_id", "slot_id")
    REFERENCES "slots"("workspace_id", "id") ON DELETE CASCADE,
  CONSTRAINT "bookings_status_check" CHECK ("status" IN ('active', 'canceled')),
  CONSTRAINT "bookings_cancellation_timestamp_check" CHECK (
    ("status" = 'active' AND "canceled_at" IS NULL) OR
    ("status" = 'canceled' AND "canceled_at" IS NOT NULL)
  )
);
CREATE UNIQUE INDEX "bookings_one_active_per_slot" ON "bookings" ("workspace_id", "slot_id")
  WHERE "status" = 'active';
CREATE INDEX "bookings_workspace_student_idx" ON "bookings" ("workspace_id", "student_id");
CREATE TABLE "seed_schedules" (
  "workspace_id" uuid PRIMARY KEY NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "test_date" date NOT NULL,
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
