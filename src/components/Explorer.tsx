"use client";

import { useState } from "react";
import { CredentialsPanel, useCredentials } from "@/components/Credentials";
import { RequestView, ResponseView } from "@/components/Views";
import {
  IDENTITY_LABELS,
  sendRequest,
  type CallResult,
  type Credentials,
  type Identity,
} from "@/lib/client";

interface Param {
  name: string;
  where: "path" | "query";
  hint: string;
  manifestKey?: string;
  example?: string;
}

interface Endpoint {
  id: string;
  method: "GET" | "POST" | "PATCH";
  path: string;
  summary: string;
  access: string;
  keyRequired: boolean;
  defaultIdentity: Identity;
  params: Param[];
  body?: string;
}

const ENDPOINTS: Endpoint[] = [
  { id: "health", method: "GET", path: "/api/health", summary: "Is the API running?", access: "Open: no key needed", keyRequired: false, defaultIdentity: "none", params: [] },
  { id: "services", method: "GET", path: "/api/services", summary: "List published advising services.", access: "API key", keyRequired: true, defaultIdentity: "none", params: [] },
  { id: "service", method: "GET", path: "/api/services/{id}", summary: "Get one service. Try the draft service ID too.", access: "API key", keyRequired: true, defaultIdentity: "none",
    params: [{ name: "id", where: "path", hint: "service ID", manifestKey: "publishedServiceId" }] },
  { id: "slots", method: "GET", path: "/api/slots", summary: "List appointment slots, with optional filters.", access: "API key", keyRequired: true, defaultIdentity: "none",
    params: [
      { name: "date", where: "query", hint: "YYYY-MM-DD (UTC)", manifestKey: "testDate" },
      { name: "serviceId", where: "query", hint: "service ID", manifestKey: "publishedServiceId" },
      { name: "available", where: "query", hint: "true or false" },
      { name: "limit", where: "query", hint: "1 to 20", example: "5" },
      { name: "offset", where: "query", hint: "0 or more", example: "0" },
    ] },
  { id: "slot", method: "GET", path: "/api/slots/{id}", summary: "Get one slot.", access: "API key", keyRequired: true, defaultIdentity: "none",
    params: [{ name: "id", where: "path", hint: "slot ID", manifestKey: "availableSlotId" }] },
  { id: "slot-patch", method: "PATCH", path: "/api/slots/{id}", summary: "Change a slot's status or room.", access: "Advisor token", keyRequired: true, defaultIdentity: "advisor",
    params: [{ name: "id", where: "path", hint: "slot ID", manifestKey: "availableSlotId" }],
    body: '{\n  "room": "Room 204"\n}' },
  { id: "me", method: "GET", path: "/api/me", summary: "Who am I? Returns the user for your token.", access: "API key + user token", keyRequired: true, defaultIdentity: "studentA", params: [] },
  { id: "bookings", method: "GET", path: "/api/bookings", summary: "List your bookings.", access: "API key + user token", keyRequired: true, defaultIdentity: "studentA",
    params: [
      { name: "status", where: "query", hint: "active or canceled" },
      { name: "limit", where: "query", hint: "1 to 20", example: "5" },
      { name: "offset", where: "query", hint: "0 or more", example: "0" },
    ] },
  { id: "booking-post", method: "POST", path: "/api/bookings", summary: "Book a slot. This writes data.", access: "Student token", keyRequired: true, defaultIdentity: "studentB", params: [],
    body: '{\n  "slotId": "SLOT_ID_HERE"\n}' },
  { id: "booking", method: "GET", path: "/api/bookings/{id}", summary: "Get one booking.", access: "API key + user token", keyRequired: true, defaultIdentity: "studentA",
    params: [{ name: "id", where: "path", hint: "booking ID", manifestKey: "studentABookingId" }] },
  { id: "booking-patch", method: "PATCH", path: "/api/bookings/{id}", summary: "Cancel a booking. This writes data.", access: "Booking owner or its advisor", keyRequired: true, defaultIdentity: "studentA",
    params: [{ name: "id", where: "path", hint: "booking ID", manifestKey: "studentABookingId" }],
    body: '{\n  "status": "canceled"\n}' },
  { id: "reset", method: "POST", path: "/api/reset", summary: "Restore your workspace's data to the starting state.", access: "API key + any user token", keyRequired: true, defaultIdentity: "studentA", params: [] },
];

const METHOD_COLORS: Record<string, string> = { GET: "#1d4ed8", POST: "#15803d", PATCH: "#b45309" };

function initialValue(param: Param, credentials: Credentials | null): string {
  return (param.manifestKey && credentials?.manifest[param.manifestKey]) || param.example || "";
}

function EndpointCard({ endpoint, credentials }: { endpoint: Endpoint; credentials: Credentials | null }) {
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [identity, setIdentity] = useState<Identity>(endpoint.defaultIdentity);
  const [sendKey, setSendKey] = useState(endpoint.keyRequired);
  const [body, setBody] = useState(() => {
    const slotId = credentials?.manifest.availableSlotId;
    return endpoint.body && slotId ? endpoint.body.replace("SLOT_ID_HERE", slotId) : (endpoint.body ?? "");
  });
  const [sendContentType, setSendContentType] = useState(Boolean(endpoint.body));
  const [result, setResult] = useState<CallResult | null>(null);
  const [busy, setBusy] = useState(false);

  const valueOf = (param: Param) => values[param.name] ?? initialValue(param, credentials);

  function buildPath(): string {
    let path = endpoint.path;
    const query = new URLSearchParams();
    for (const param of endpoint.params) {
      const value = valueOf(param).trim();
      if (param.where === "path") path = path.replace(`{${param.name}}`, encodeURIComponent(value));
      else if (value) query.set(param.name, value);
    }
    const text = query.toString();
    return text ? `${path}?${text}` : path;
  }

  async function send() {
    setBusy(true);
    setResult(
      await sendRequest(credentials, {
        method: endpoint.method,
        path: buildPath(),
        identity,
        sendKey,
        contentType: sendContentType ? "application/json" : null,
        body: endpoint.body !== undefined ? body : undefined,
      }),
    );
    setBusy(false);
  }

  return (
    <section style={{ background: "white", border: "1px solid #d5e2ec", borderRadius: 10, marginBottom: 12 }}>
      <button
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        style={{ display: "flex", gap: 12, alignItems: "center", width: "100%", textAlign: "left", padding: 14, border: 0, background: "none", cursor: "pointer", fontSize: 16 }}
      >
        <span style={{ background: METHOD_COLORS[endpoint.method], color: "white", fontWeight: 700, padding: "2px 10px", borderRadius: 6, minWidth: 56, textAlign: "center" }}>
          {endpoint.method}
        </span>
        <code style={{ fontWeight: 700 }}>{endpoint.path}</code>
        <span style={{ color: "#526879" }}>{endpoint.summary}</span>
      </button>
      {open ? (
        <div style={{ padding: "0 16px 16px" }}>
          <p style={{ margin: "4px 0 12px" }}><strong>Who can call it:</strong> {endpoint.access}</p>

          {endpoint.params.map((param) => (
            <label key={param.name} style={{ display: "block", marginBottom: 8 }}>
              <span style={{ display: "inline-block", width: 110, fontWeight: 600 }}>
                {param.name} <small style={{ color: "#526879" }}>({param.where})</small>
              </span>
              <input
                value={valueOf(param)}
                placeholder={param.hint}
                onChange={(event) => setValues({ ...values, [param.name]: event.target.value })}
                style={{ width: "min(420px, 70%)", padding: 6, fontFamily: "monospace" }}
              />
            </label>
          ))}

          {endpoint.body !== undefined ? (
            <label style={{ display: "block", marginBottom: 8 }}>
              <strong>Request body (JSON)</strong> <small>Edit it, or break it on purpose.</small>
              <textarea
                value={body}
                onChange={(event) => setBody(event.target.value)}
                rows={4}
                style={{ display: "block", width: "100%", boxSizing: "border-box", fontFamily: "monospace", padding: 8 }}
              />
            </label>
          ) : null}

          <fieldset style={{ border: "1px solid #d5e2ec", borderRadius: 8, margin: "10px 0" }}>
            <legend>Headers to send</legend>
            <label style={{ marginRight: 20 }}>
              <input type="checkbox" checked={sendKey} onChange={(event) => setSendKey(event.target.checked)} /> X-API-Key
            </label>
            {endpoint.body !== undefined ? (
              <label style={{ marginRight: 20 }}>
                <input type="checkbox" checked={sendContentType} onChange={(event) => setSendContentType(event.target.checked)} /> Content-Type: application/json
              </label>
            ) : null}
            <label>
              Authorization:{" "}
              <select value={identity} onChange={(event) => setIdentity(event.target.value as Identity)}>
                {(Object.keys(IDENTITY_LABELS) as Identity[]).map((key) => (
                  <option key={key} value={key}>{IDENTITY_LABELS[key]}</option>
                ))}
              </select>
            </label>
          </fieldset>

          <button
            onClick={send}
            disabled={busy || !credentials}
            style={{ padding: "8px 20px", fontWeight: 700, background: "#075985", color: "white", border: 0, borderRadius: 6, cursor: "pointer" }}
          >
            {busy ? "Sending…" : "Send request"}
          </button>
          {!credentials ? <span style={{ marginLeft: 10, color: "#b45309" }}>Enter your credentials above first.</span> : null}

          {result ? (
            <>
              <RequestView result={result} />
              <ResponseView result={result} />
            </>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

export default function Explorer() {
  const { credentials, ready, setCredentials } = useCredentials();
  return (
    <main style={{ maxWidth: 940, margin: "32px auto", padding: "0 24px 64px" }}>
      <p><a href="/">← Home</a> · <a href="/advising">Booking website</a></p>
      <h1>API explorer</h1>
      <p style={{ lineHeight: 1.6 }}>
        Every endpoint of the advising API is listed below. Open one, fill in the fields, choose which headers to
        send, and press <strong>Send request</strong>. You will see exactly what was sent and what came back. Try
        removing the API key, using a different person, or breaking the JSON to see how the API reacts.
      </p>
      {ready ? <CredentialsPanel credentials={credentials} onChange={setCredentials} /> : null}
      {ENDPOINTS.map((endpoint) => (
        <EndpointCard key={`${endpoint.id}-${credentials?.apiKey ?? "none"}`} endpoint={endpoint} credentials={credentials} />
      ))}
    </main>
  );
}
