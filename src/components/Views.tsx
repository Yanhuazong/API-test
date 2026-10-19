"use client";

import { useState } from "react";
import { prettyBody, statusColor, type CallResult } from "@/lib/client";

const mono = { fontFamily: "ui-monospace, Consolas, monospace", fontSize: 13 } as const;
const learningHeaders = ["x-ratelimit-limit", "x-ratelimit-remaining", "x-ratelimit-reset", "retry-after", "location", "content-type"];

export function StatusBadge({ result }: { result: CallResult }) {
  return (
    <span style={{ background: statusColor(result.status), color: "white", padding: "2px 10px", borderRadius: 999, fontWeight: 700 }}>
      {result.status === 0 ? "No response" : `${result.status} ${result.statusText}`}
    </span>
  );
}

export function RequestView({ result }: { result: CallResult }) {
  return (
    <div>
      <h4 style={{ margin: "12px 0 4px" }}>Request</h4>
      <pre style={{ ...mono, background: "#eef4f8", padding: 10, borderRadius: 6, overflow: "auto", margin: 0 }}>
        {`${result.method} ${result.url}\n`}
        {Object.entries(result.requestHeaders).map(([key, value]) => `${key}: ${value}\n`).join("")}
        {result.requestBody ? `\n${result.requestBody}` : ""}
      </pre>
    </div>
  );
}

export function ResponseView({ result }: { result: CallResult }) {
  const [showAll, setShowAll] = useState(false);
  const entries = Object.entries(result.responseHeaders);
  const shown = showAll ? entries : entries.filter(([key]) => learningHeaders.includes(key));
  return (
    <div>
      <h4 style={{ margin: "12px 0 4px" }}>
        Response <StatusBadge result={result} /> <span style={{ color: "#526879", fontWeight: 400 }}>{result.ms} ms</span>
      </h4>
      {result.networkError ? <p role="alert" style={{ color: "#b91c1c" }}>{result.networkError}</p> : null}
      <details open>
        <summary>Headers ({shown.length}{showAll ? "" : ` of ${entries.length}`})</summary>
        <pre style={{ ...mono, background: "#eef4f8", padding: 10, borderRadius: 6, overflow: "auto" }}>
          {shown.map(([key, value]) => `${key}: ${value}`).join("\n") || "(none)"}
        </pre>
        <button onClick={() => setShowAll(!showAll)} style={{ fontSize: 12 }}>
          {showAll ? "Show key headers only" : "Show all headers"}
        </button>
      </details>
      <h5 style={{ margin: "10px 0 4px" }}>Body</h5>
      <pre style={{ ...mono, background: "#0f2233", color: "#d9ecff", padding: 10, borderRadius: 6, overflow: "auto", maxHeight: 360, margin: 0 }}>
        {prettyBody(result.responseBody) || "(empty body)"}
      </pre>
    </div>
  );
}
