# API Investigation Lab

A complete, fictional campus advising API for undergraduate students to explore
with Postman. Students investigate endpoint contracts and data boundaries; they
do not build the backend.

## Quick start

1. Install Node.js 20.11+ and create a PostgreSQL database with Neon, Supabase,
   or a local PostgreSQL installation. Docker is not required.
2. Copy `.env.example` to `.env` and set `DATABASE_URL` to the server-side
   connection string. Never use a `NEXT_PUBLIC_` variable for database access.
3. Run `npm ci`, `npm run db:migrate`, and `npm run lab:provision -- --count 6`.
4. Start `npm run dev`, then open `http://localhost:3000`.
5. Distribute each private `lab-output/workspace-NN/handout.json` only to its
   assigned student/pair. These generated files contain secrets and are ignored
   by Git.

See [the instructor guide](./docs/instructor-guide.md) for hosting, deployment,
workspace lifecycle, and teaching notes. Students should start with the
[API guide](./docs/student-api-guide.md) and [worksheet](./docs/student-investigation.md).

## Commands that change data

- `npm run db:migrate`: applies pending schema migrations.
- `npm run lab:provision -- --count 6`: creates missing classroom workspaces;
  repeated runs retain existing records and credentials.
- `npm run lab:reset -- --workspace workspace-01`: restores one workspace to
  its saved seed records and saved dates.
- `npm run lab:refresh-dates -- --workspace workspace-01`: replaces one
  workspace's seed records and advances its three-day schedule.
- `npm run test:integration` and `npm run test:concurrency`: use only the
  explicitly configured disposable `INTEGRATION_DATABASE_URL`.

Add a new, sequentially numbered SQL file in `drizzle/` for each schema change;
never edit an already-applied migration. Both the development migration command
and HTTP test launcher apply pending files in name order and record each applied
filename.

## Configuration

| Variable | Required for | Purpose |
|---|---|---|
| `DATABASE_URL` | API, migrations, classroom scripts | Server-only PostgreSQL connection |
| `INTEGRATION_DATABASE_URL` | Integration/concurrency tests | Separate disposable PostgreSQL database; tests refuse to run without it |

No database URL or generated secret is printed by the setup scripts.
