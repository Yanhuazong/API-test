CREATE TABLE "rate_limits" (
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "window_start" timestamptz NOT NULL,
  "request_count" integer NOT NULL DEFAULT 0,
  PRIMARY KEY ("workspace_id", "window_start")
);
