"use client";

import { useEffect, useState } from "react";
import { loadCredentials, parseHandout, saveCredentials, type Credentials } from "@/lib/client";

export function useCredentials(): { credentials: Credentials | null; ready: boolean; setCredentials: (c: Credentials | null) => void } {
  const [credentials, setState] = useState<Credentials | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setState(loadCredentials());
    setReady(true);
  }, []);
  return {
    credentials,
    ready,
    setCredentials: (next) => {
      saveCredentials(next);
      setState(next);
    },
  };
}

const box = { background: "white", borderRadius: 12, padding: 20, marginBottom: 20, border: "1px solid #d5e2ec" } as const;
const input = { width: "100%", padding: 8, border: "1px solid #9fb3c4", borderRadius: 6, fontFamily: "monospace", boxSizing: "border-box" } as const;

export function CredentialsPanel({
  credentials,
  onChange,
}: {
  credentials: Credentials | null;
  onChange: (c: Credentials | null) => void;
}) {
  const [pasted, setPasted] = useState("");
  const [error, setError] = useState("");

  if (credentials) {
    return (
      <div style={{ ...box, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <span>
          <strong>Credentials loaded.</strong> They stay in this browser tab only and are cleared when you close it.
        </span>
        <button onClick={() => onChange(null)} style={{ padding: "6px 12px" }}>Clear</button>
      </div>
    );
  }

  return (
    <div style={box}>
      <h2 style={{ marginTop: 0 }}>Enter your credentials</h2>
      <p>
        Open the handout file your instructor gave you, then paste its entire contents here. This sets your API key
        and the three user tokens for this browser tab.
      </p>
      <textarea
        value={pasted}
        onChange={(event) => setPasted(event.target.value)}
        rows={8}
        placeholder='{ "apiKey": "...", "tokens": { ... }, "manifest": { ... } }'
        style={input}
      />
      {error ? <p role="alert" style={{ color: "#b91c1c" }}>{error}</p> : null}
      <button
        style={{ marginTop: 8, padding: "8px 16px", fontWeight: 600 }}
        onClick={() => {
          try {
            onChange(parseHandout(pasted));
            setError("");
            setPasted("");
          } catch (problem) {
            setError(problem instanceof Error ? problem.message : "Could not read the handout.");
          }
        }}
      >
        Save credentials
      </button>
    </div>
  );
}
