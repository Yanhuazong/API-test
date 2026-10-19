"use client";

import { useState } from "react";
import { CredentialsPanel, useCredentials } from "@/components/Credentials";
import { RequestView, ResponseView } from "@/components/Views";
import { sendRequest, type CallResult, type Credentials } from "@/lib/client";

type Person = "studentA" | "studentB" | "advisor";

const card = { background: "white", border: "1px solid #d5e2ec", borderRadius: 10, padding: 16, marginBottom: 12 } as const;
const primary = { padding: "8px 18px", fontWeight: 700, background: "#075985", color: "white", border: 0, borderRadius: 6, cursor: "pointer" } as const;
const editor = { width: "100%", boxSizing: "border-box", fontFamily: "ui-monospace, Consolas, monospace", fontSize: 14, padding: 10, border: "1px solid #9fb3c4", borderRadius: 6 } as const;

interface Example { title: string; note: string; query: string; variables?: string }

function examples(credentials: Credentials): Example[] {
  const slotId = credentials.manifest.availableSlotId;
  return [
    {
      title: "1. Ask for only what you need",
      note: "Compare with GET /api/services, which always returns every field. Delete a field and run it again.",
      query: "{\n  services {\n    name\n    description\n  }\n}",
    },
    {
      title: "2. Follow relationships in one request",
      note: "One request returns slots and the service each belongs to. With REST this takes two calls.",
      query: `{\n  slots(available: true, limit: 3) {\n    startsAt\n    room\n    advisorName\n    service {\n      name\n    }\n  }\n}`,
    },
    {
      title: "3. Several things at once",
      note: "Who am I, and what have I booked? Try this as Avery, then as Casey (advisor).",
      query: "{\n  me {\n    displayName\n    role\n  }\n  myBookings(limit: 5) {\n    status\n    slot {\n      startsAt\n      service {\n        name\n      }\n    }\n  }\n}",
    },
    {
      title: "4. Variables",
      note: "Values go in the Variables box, not inside the query text.",
      query: "query Open($date: String, $limit: Int) {\n  slots(date: $date, available: true, limit: $limit) {\n    id\n    startsAt\n  }\n}",
      variables: JSON.stringify({ date: credentials.manifest.testDate, limit: 5 }, null, 2),
    },
    {
      title: "5. Change data with a mutation",
      note: "Books a slot as the signed-in student. Run it twice and read the error.",
      query: "mutation Book($slotId: ID!) {\n  bookSlot(slotId: $slotId) {\n    id\n    status\n    slot {\n      startsAt\n    }\n  }\n}",
      variables: JSON.stringify({ slotId }, null, 2),
    },
    {
      title: "6. Ask for something that doesn't exist",
      note: "Add a made-up field. Look at the HTTP status and the errors list.",
      query: "{\n  services {\n    name\n    price\n  }\n}",
    },
  ];
}

function GraphqlApp({ credentials }: { credentials: Credentials }) {
  const list = examples(credentials);
  const [person, setPerson] = useState<Person>("studentA");
  const [query, setQuery] = useState(list[0].query);
  const [variables, setVariables] = useState("");
  const [result, setResult] = useState<CallResult | null>(null);
  const [error, setError] = useState("");
  const [running, setRunning] = useState(false);

  async function run() {
    setError("");
    let parsed: unknown;
    if (variables.trim()) {
      try {
        parsed = JSON.parse(variables);
      } catch {
        setError("Variables must be valid JSON, for example {\"limit\": 3}.");
        return;
      }
    }
    setRunning(true);
    const response = await sendRequest(credentials, {
      method: "POST",
      path: "/api/graphql",
      identity: person,
      sendKey: true,
      contentType: "application/json",
      body: JSON.stringify(parsed === undefined ? { query } : { query, variables: parsed }),
    });
    setResult(response);
    setRunning(false);
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: 24, alignItems: "start" }}>
      <div>
        <div style={card}>
          <h2 style={{ marginTop: 0 }}>Try an example</h2>
          {list.map((example) => (
            <details key={example.title} style={{ marginBottom: 6 }}>
              <summary style={{ cursor: "pointer", fontWeight: 600 }}>{example.title}</summary>
              <p style={{ margin: "6px 0" }}>{example.note}</p>
              <button onClick={() => { setQuery(example.query); setVariables(example.variables ?? ""); }}>Load into editor</button>
            </details>
          ))}
        </div>
        <div style={card}>
          <label>
            <strong>Run as</strong>{" "}
            <select value={person} onChange={(event) => setPerson(event.target.value as Person)}>
              <option value="studentA">Avery (student)</option>
              <option value="studentB">Bailey (student)</option>
              <option value="advisor">Casey (advisor)</option>
            </select>
          </label>
          <h3>Query</h3>
          <textarea value={query} onChange={(event) => setQuery(event.target.value)} rows={12} spellCheck={false} style={editor} />
          <h3>Variables (JSON, optional)</h3>
          <textarea value={variables} onChange={(event) => setVariables(event.target.value)} rows={4} spellCheck={false} style={editor} />
          {error ? <p role="alert" style={{ color: "#b91c1c" }}>{error}</p> : null}
          <button style={primary} onClick={run} disabled={running}>{running ? "Running…" : "Run"}</button>
        </div>
      </div>
      <div style={card}>
        <h2 style={{ marginTop: 0 }}>What was sent and received</h2>
        {result ? (
          <>
            <RequestView result={result} />
            <ResponseView result={result} />
          </>
        ) : <p>Run a query to see the request and response.</p>}
      </div>
    </div>
  );
}

export default function GraphqlExplorer() {
  const { credentials, ready, setCredentials } = useCredentials();
  return (
    <main style={{ maxWidth: 1180, margin: "32px auto", padding: "0 24px 64px" }}>
      <p><a href="/">← Home</a> · <a href="/explorer">API explorer</a> · <a href="/advising">Campus advising</a></p>
      <h1>GraphQL explorer</h1>
      <p style={{ lineHeight: 1.6, maxWidth: 800 }}>
        The same advising data, through a different style of API. The REST endpoints have many URLs that each return a
        fixed shape. GraphQL has one URL (<code>POST /api/graphql</code>), and your request describes exactly which
        fields you want back. See <a href="/docs/graphql-guide">the GraphQL guide</a>.
      </p>
      {ready ? <CredentialsPanel credentials={credentials} onChange={setCredentials} /> : null}
      {credentials ? <GraphqlApp key={credentials.apiKey} credentials={credentials} /> : null}
    </main>
  );
}
