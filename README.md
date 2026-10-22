# API Investigation

A complete, fictional campus advising API for undergraduate students to explore
in the browser and, optionally, in Postman. Students investigate endpoint
contracts and data boundaries; they do not build the backend.

## What students use

- `/advising`: a small booking website built on the API. Students book and
  cancel appointments, and a side panel shows every API call the page makes.
- `/explorer`: lists every endpoint with fields to fill in and a **Send request**
  button. It shows the request that was sent and the full response.
- Postman (optional): the collection and environment under `postman/`.

Instructor only: `/agent` is an agent lab where an AI assistant operates the
same API through an MCP server at `/api/mcp`. See the
[agent lab guide](./docs/agent-lab-guide.md).

Students paste their private handout file into either page. The credentials are
kept only in that browser tab (session storage).

## Quick start

1. Install Node.js 20.11+ and create a PostgreSQL database with Neon, Supabase,
   or a local PostgreSQL installation. Docker is not required.
2. Copy `.env.example` to `.env` and set `DATABASE_URL` to the server-side
   connection string. Never use a `NEXT_PUBLIC_` variable for database access.
3. Run `npm ci`, `npm run db:migrate`, and `npm run class:provision -- --count 6`.
4. For development on that computer, start `npm run dev` and open
   `http://localhost:3000`. For a class, deploy the app or otherwise provide a
   network-reachable base URL; students use that URL in Postman. `localhost`
   always refers to the computer making the request.
5. Distribute each private `class-output/workspace-NN/handout.json` only to its
   assigned student/pair. These generated files contain secrets and are ignored
   by Git.

See [the instructor guide](./docs/instructor-guide.md) for hosting, deployment,
workspace lifecycle, and teaching notes. Students should start with the
[API guide](./docs/student-api-guide.md) and [worksheet](./docs/student-investigation.md).

## Commands that change data

- `npm run db:migrate`: applies pending schema migrations.
- `npm run class:provision -- --count 6`: creates missing classroom workspaces;
  repeated runs retain existing records and credentials.
- `npm run class:reset -- --workspace workspace-01`: restores one workspace to
  its saved seed records and saved dates.
- `npm run class:refresh-dates -- --workspace workspace-01`: replaces one
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
| `INTEGRATION_DATABASE_URL` | Integration/concurrency/agent tests | Separate disposable PostgreSQL database; tests refuse to run without it |
| `LLM_API_KEY` | Agent lab Live mode (optional) | Server-only Anthropic API key |
| `INSTRUCTOR_PASSCODE` | Agent lab Live mode (optional) | Passcode typed into the Live tab |
| `LLM_MODEL` | Agent lab Live mode (optional) | Model ID; default `claude-opus-5-5` |
| `AGENT_API_BASE_URL` | Agent lab (optional) | Public base URL the MCP server calls; defaults to the request origin |

No database URL or generated secret is printed by the setup scripts.
