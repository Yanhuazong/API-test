# API Investigation Lab implementation plan

## Schema

PostgreSQL stores workspaces, users, services, slots, bookings, and a saved
seed schedule. UUIDs are stable per workspace and seed name. Relationships
that must remain in one workspace use composite foreign keys. The active
booking constraint is a partial unique index on `(workspace_id, slot_id)`
where `status = 'active'`. Times are `timestamptz`; seeded schedule dates are
stored once so resets reproduce the same records and dates.

## Routes

- `GET /api/health`
- Public-within-workspace reads: `GET /api/services[/:id]`,
  `GET /api/slots[/:id]`
- Teaching identity and owned/assigned booking operations:
  `GET /api/me`, `GET|POST /api/bookings`, `GET|PATCH /api/bookings/:id`
- Advisor slot updates: `PATCH /api/slots/:id`
- Workspace-scoped restore: `POST /api/lab/reset`

All teaching API routes require `X-Lab-Key`; token-authenticated routes also
require `Authorization: Bearer <opaque-token>`. The key and token are hashed
at rest, resolved server-side, and must identify the same workspace.

## Access rules

Every query and mutation is workspace-scoped. Public reads expose only
published services and explicitly selected public fields. Students can read
and cancel their own bookings; assigned advisors can read/cancel bookings and
edit their slots. Ownership violations are 403; missing or cross-workspace
records are 404. The workspace row is locked before mutations, serializing
booking, slot closure, and reset operations.

## File structure

- `src/db`: Drizzle schema and database connection
- `src/lib`: request validation, auth, standard responses, and seed operations
- `src/app/api`: Next.js Route Handlers
- `scripts`: provisioning, reset, schedule refresh, and HTTP-test launcher
- `drizzle`: versioned SQL migrations
- `docs`: student guide, investigation worksheet, instructor guide
- `postman`: importable Collection v2.1 and environment template
- `tests`: integration and real concurrent HTTP requests

## Testing plan

Run lint, typecheck, and production build without requiring credentials.
Integration and concurrency tests require `INTEGRATION_DATABASE_URL` and use
an isolated, automatically provisioned test workspace in that database. Tests
exercise the HTTP server and query the database to verify persistence,
isolation, field visibility, state transitions, reset scoping, and the
database-enforced one-active-booking invariant.
