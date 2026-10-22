# Instructor guide

## Local setup

1. Install Node.js 20.11+ and create a PostgreSQL database on Neon, Supabase,
   or a local PostgreSQL service. No Docker is needed.
2. Copy `.env.example` to `.env`. Set server-only `DATABASE_URL`; for tests,
   configure a separate disposable `INTEGRATION_DATABASE_URL`.
3. Run `npm ci`, then `npm run db:migrate`.
4. Run `npm run class:provision -- --count 6`. The command creates missing
   `workspace-01` through `workspace-06`; repeated execution preserves existing
   workspace records and private credentials.
5. For instructor-only development, start `npm run dev` and open
   `http://localhost:3000`. For classroom use, deploy the app or provide a
   network-reachable URL. Do not give students your laptop's `localhost` URL:
   from their computers it refers to their own machines, not the instructor's.

Never print, paste into class materials, or commit connection strings, API keys,
or user tokens. Keep `class-output/` private; it is ignored by Git.

## Hosted PostgreSQL

Create a PostgreSQL database/project with Neon or Supabase, enable SSL as
required by the provider, and copy its pooled or direct server connection URL
into `DATABASE_URL`. Ensure the provider permits connections from the deployment
environment. Do not expose a service-role or database credential to the browser.

## Configuration and commands

| Variable/command | Effect |
|---|---|
| `DATABASE_URL` | API, provisioning, and migrations |
| `RATE_LIMIT_PER_MINUTE` | Optional; requests per workspace per minute (default 10) |
| `INTEGRATION_DATABASE_URL` | Separate disposable test database only |
| `npm run db:migrate` | Applies versioned SQL migrations; changes schema |
| `npm run class:provision -- --count 6` | Creates missing isolated workspaces and private handouts |
| `npm run class:reset -- --workspace workspace-01` | Destructively restores only the specified workspace |
| `npm run class:refresh-dates -- --workspace workspace-01` | Replaces seed records and moves that workspace's schedule to future dates |
| `npm run dev` | Local Next.js development server |
| `npm run lint`, `npm run typecheck`, `npm run build` | Static and production checks |
| `npm run test:integration` | HTTP tests against test workspace in `INTEGRATION_DATABASE_URL` |
| `npm run test:concurrency` | Real concurrent HTTP booking requests plus database-state verification |
| `npm run test:agent`, `npm run test:agent-unit` | Agent lab and MCP server tests; see `docs/agent-lab-guide.md` |

The instructor-only agent lab (`/agent`, MCP server at `/api/mcp`) has its own
guide: `docs/agent-lab-guide.md`.

To change the schema, add a new sequentially numbered SQL migration in
`drizzle/`. Do not change a migration that has already been applied to any
database.

Only reset or refresh a classroom workspace when students are not using it.
Reset preserves IDs, keys, tokens, and the saved schedule. Refresh advances the
schedule but preserves stable seed IDs.

## Six private workspace handouts

Provision with `npm run class:provision -- --count 6`. Distribute each distinct
`class-output/workspace-NN/handout.json` to only the assigned pair. It contains
that workspace's key, Student A/B and advisor tokens, and a non-secret seed
manifest. Do not email a shared six-workspace bundle or commit these files.
Students first build six requests by hand in their own Postman environment
(see `docs/build-your-first-requests.md`), copying values from their handout.
They may then import the collection and environment template for the rest.
Credentials stay local.

## Deploy to Vercel

Push the project to a private or appropriately licensed Git repository, import
it in Vercel, set the server-only `DATABASE_URL` environment variable, and
deploy. Run `npm run db:migrate` against the intended database before enabling
the deployment. Provision workspaces from a trusted local environment using
the same `DATABASE_URL`, then distribute handouts securely. Route Handlers use
the Node.js runtime and are compatible with Vercel's Node functions.

## Browser tools for students

Students can work entirely in the browser:

- `/advising` is a booking website that calls the API; its right-hand panel
  lists each call. Every button click costs one or two API requests.
- `/explorer` lets students build and send any request, including deliberately
  broken ones (no key, wrong person, bad JSON).

Both read the handout file students paste in and keep it in session storage for
that tab only. Both count against the rate limit. At the default of 10 requests
per minute the booking website will hit 429 quickly, which is a good five-minute
demo but frustrating for open exploration. Consider `RATE_LIMIT_PER_MINUTE=60`
for general use and lowering it for the rate-limit exercise. "Start over" in
the website and `POST /api/reset` are never counted.

## Rate limiting

Each workspace may make `RATE_LIMIT_PER_MINUTE` requests per minute (default 10,
counted per API key in the `rate_limits` table; run `npm run db:migrate` to
create it). `/api/reset` and `/api/health` are exempt. 10 is low enough that
students hit it in the Collection Runner demo, but it also means the 38-request
"Deterministic automated sequence" folder will return 429s at the default. For
that folder, run it a section at a time, or raise the limit (for example
`RATE_LIMIT_PER_MINUTE=1000`) for a rehearsal deployment.

## Teaching authentication and safety

Tokens are random opaque values; only SHA-256 hashes are stored. The APIresolves a token to exactly one fictional user and requires its workspace to
match the API key. It intentionally skips password entry, MFA, account
recovery, token expiration/rotation, session revocation, and a full identity
provider. It is a teaching model, not production authentication. A production
product needs an appropriate identity provider, account lifecycle, secure
credential storage and rotation, abuse controls, and a complete authorization
design.

The API key is a classroom isolation mechanism, not a replacement for user
authentication. It lets assigned students explore public reads only within
their workspace. Any identity can reset only its own workspace for convenience;
never copy this reset policy into a production system.

## Expected observations / answer key

- Services list returns two published services; draft service and its slot are
  404/hidden.
- `date` is a UTC calendar-date filter. Slot lists sort by start timestamp then
  UUID and report `available` from open status and active-booking existence.
- Invalid JSON is `MALFORMED_JSON`; wrong content type is
  `UNSUPPORTED_MEDIA_TYPE`; valid JSON with invalid or extra fields is
  `VALIDATION_ERROR`.
- Missing credentials and invalid tokens are 401. A valid but unauthorized
  in-workspace student gets 403. Missing and cross-workspace IDs both get 404.
- Student B can create only for self, gets 201 for an available future slot,
  409 `SLOT_UNAVAILABLE` for an occupied one and 409 `SLOT_NOT_BOOKABLE` for
  closed/past slots. Unknown fields cannot impersonate another user.
- Students see only their bookings and never receive `privateNote`. The assigned
  advisor can access bookings for their slots and sees that field. Public slot
  fields omit `internalNote` and email.
- Cancellation retains the booking, sets `canceledAt` once, and releases the
  slot. Repeated cancellation is idempotent.
- The database partial unique index permits only one active booking per slot.
  Booking and slot closure/reset operations serialize on the workspace row.

## Test database

Set `INTEGRATION_DATABASE_URL` to a dedicated disposable PostgreSQL database
with the migrations applied. The test launcher starts a local HTTP server with
that database URL, creates an isolated workspace, exercises it, and cleans up
only its generated workspace. Do not point it at classroom data.

## Disable the API after class

Remove or disable the Vercel deployment and revoke its database connection
credential in the provider. If retaining the database, keep or delete classroom
workspaces according to retention policy. Revoke/rotate the database password
if it was shared or exposed. Do not delete a shared database without confirming
that it contains no other data.
