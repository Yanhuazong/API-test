import {
  check,
  date,
  foreignKey,
  index,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const workspaces = pgTable("workspaces", {
  id: uuid("id").primaryKey(),
  name: text("name").notNull(),
  keyHash: varchar("key_hash", { length: 64 }).notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const users = pgTable("users", {
  id: uuid("id").primaryKey(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  displayName: text("display_name").notNull(),
  email: text("email").notNull(),
  role: text("role").notNull(),
  tokenHash: varchar("token_hash", { length: 64 }).notNull().unique(),
}, (table) => [
  unique("users_workspace_id_id_unique").on(table.workspaceId, table.id),
  unique("users_workspace_email_unique").on(table.workspaceId, table.email),
  check("users_role_check", sql`${table.role} in ('student', 'advisor')`),
]);

export const services = pgTable("services", {
  id: uuid("id").primaryKey(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description").notNull(),
  eligibility: text("eligibility").notNull(),
  bookingInstructions: text("booking_instructions").notNull(),
  publicationStatus: text("publication_status").notNull(),
}, (table) => [
  unique("services_workspace_id_id_unique").on(table.workspaceId, table.id),
  check("services_publication_status_check", sql`${table.publicationStatus} in ('draft', 'published')`),
]);

export const slots = pgTable("slots", {
  id: uuid("id").primaryKey(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  serviceId: uuid("service_id").notNull(),
  advisorId: uuid("advisor_id").notNull(),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
  room: text("room"),
  status: text("status").notNull(),
  internalNote: text("internal_note"),
}, (table) => [
  unique("slots_workspace_id_id_unique").on(table.workspaceId, table.id),
  foreignKey({
    name: "slots_workspace_service_fk",
    columns: [table.workspaceId, table.serviceId],
    foreignColumns: [services.workspaceId, services.id],
  }).onDelete("cascade"),
  foreignKey({
    name: "slots_workspace_advisor_fk",
    columns: [table.workspaceId, table.advisorId],
    foreignColumns: [users.workspaceId, users.id],
  }).onDelete("cascade"),
  check("slots_status_check", sql`${table.status} in ('open', 'closed')`),
  check("slots_time_order_check", sql`${table.endsAt} > ${table.startsAt}`),
  index("slots_workspace_starts_idx").on(table.workspaceId, table.startsAt, table.id),
]);

export const bookings = pgTable("bookings", {
  id: uuid("id").primaryKey(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  studentId: uuid("student_id").notNull(),
  slotId: uuid("slot_id").notNull(),
  status: text("status").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  canceledAt: timestamp("canceled_at", { withTimezone: true }),
  privateNote: text("private_note"),
}, (table) => [
  unique("bookings_workspace_id_id_unique").on(table.workspaceId, table.id),
  foreignKey({
    name: "bookings_workspace_student_fk",
    columns: [table.workspaceId, table.studentId],
    foreignColumns: [users.workspaceId, users.id],
  }).onDelete("cascade"),
  foreignKey({
    name: "bookings_workspace_slot_fk",
    columns: [table.workspaceId, table.slotId],
    foreignColumns: [slots.workspaceId, slots.id],
  }).onDelete("cascade"),
  check("bookings_status_check", sql`${table.status} in ('active', 'canceled')`),
  check("bookings_cancellation_timestamp_check", sql`(
    (${table.status} = 'active' AND ${table.canceledAt} IS NULL) OR
    (${table.status} = 'canceled' AND ${table.canceledAt} IS NOT NULL)
  )`),
  uniqueIndex("bookings_one_active_per_slot")
    .on(table.workspaceId, table.slotId)
    .where(sql`${table.status} = 'active'`),
  index("bookings_workspace_student_idx").on(table.workspaceId, table.studentId),
]);

export const seedSchedules = pgTable("seed_schedules", {
  workspaceId: uuid("workspace_id").primaryKey().references(() => workspaces.id, { onDelete: "cascade" }),
  testDate: date("test_date").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
