"use client";

import { useEffect, useState } from "react";
import { CredentialsPanel, useCredentials } from "@/components/Credentials";
import { RequestView, ResponseView, StatusBadge } from "@/components/Views";
import { sendRequest, type CallResult, type Credentials } from "@/lib/client";

type Person = "studentA" | "studentB" | "advisor";

interface Service { id: string; name: string; description: string; eligibility: string; bookingInstructions: string }
interface Slot { id: string; advisorName: string; startsAt: string; endsAt: string; room: string | null; status: string; available: boolean }
interface Booking { id: string; slotId: string; status: string; slot: { startsAt: string; endsAt: string; room: string | null; serviceName: string } }

const PEOPLE: Record<Person, string> = {
  studentA: "Avery (student)",
  studentB: "Bailey (student)",
  advisor: "Casey (advisor)",
};

const card = { background: "white", border: "1px solid #d5e2ec", borderRadius: 10, padding: 16, marginBottom: 12 } as const;
const primary = { padding: "6px 14px", fontWeight: 700, background: "#075985", color: "white", border: 0, borderRadius: 6, cursor: "pointer" } as const;

function parse<T>(result: CallResult): T | null {
  try {
    return JSON.parse(result.responseBody) as T;
  } catch {
    return null;
  }
}

function failureText(result: CallResult): string {
  if (result.status === 429) {
    return `You have used up your requests for this minute. Wait ${result.responseHeaders["retry-after"] ?? "a few"} seconds and try again.`;
  }
  const body = parse<{ error?: { code?: string; message?: string } }>(result);
  return body?.error ? `${body.error.code}: ${body.error.message}` : (result.networkError ?? `Request failed with status ${result.status}.`);
}

function timeRange(startsAt: string, endsAt: string): string {
  const options: Intl.DateTimeFormatOptions = { hour: "numeric", minute: "2-digit", timeZone: "UTC" };
  return `${new Date(startsAt).toLocaleTimeString([], options)} – ${new Date(endsAt).toLocaleTimeString([], options)} UTC`;
}

function defaultDate(credentials: Credentials | null): string {
  return credentials?.manifest.testDate ?? new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);
}

function App({ credentials }: { credentials: Credentials }) {
  const [person, setPerson] = useState<Person>("studentA");
  const [tab, setTab] = useState<"book" | "mine">("book");
  const [services, setServices] = useState<Service[]>([]);
  const [serviceId, setServiceId] = useState("");
  const [date, setDate] = useState(() => defaultDate(credentials));
  const [slots, setSlots] = useState<Slot[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [log, setLog] = useState<CallResult[]>([]);
  const [selectedLog, setSelectedLog] = useState<number | null>(null);
  const [remaining, setRemaining] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  async function call(method: string, path: string, body?: unknown): Promise<CallResult> {
    const result = await sendRequest(credentials, {
      method,
      path,
      identity: person,
      sendKey: true,
      contentType: body === undefined ? null : "application/json",
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    setLog((previous) => [result, ...previous].sort((a, b) => b.startedAt - a.startedAt).slice(0, 40));
    setSelectedLog(null);
    const left = result.responseHeaders["x-ratelimit-remaining"];
    if (left !== undefined) setRemaining(left);
    return result;
  }

  useEffect(() => {
    let current = true;
    (async () => {
      const result = await call("GET", "/api/services");
      if (!current) return;
      const body = parse<{ data: Service[] }>(result);
      if (result.status === 200 && body) {
        setServices(body.data);
        setServiceId((existing) => existing || body.data[0]?.id || "");
      } else setMessage({ ok: false, text: failureText(result) });
    })();
    return () => { current = false; };
  }, [person]);

  useEffect(() => {
    if (!serviceId) return;
    let current = true;
    (async () => {
      const result = await call("GET", `/api/slots?serviceId=${serviceId}&date=${date}&limit=20`);
      if (!current) return;
      const body = parse<{ data: Slot[] }>(result);
      if (result.status === 200 && body) setSlots(body.data);
      else setMessage({ ok: false, text: failureText(result) });
    })();
    return () => { current = false; };
  }, [person, serviceId, date, tick]);

  useEffect(() => {
    if (tab !== "mine") return;
    let current = true;
    (async () => {
      const result = await call("GET", "/api/bookings?limit=20");
      if (!current) return;
      const body = parse<{ data: Booking[] }>(result);
      if (result.status === 200 && body) setBookings(body.data);
      else setMessage({ ok: false, text: failureText(result) });
    })();
    return () => { current = false; };
  }, [person, tab, tick]);

  async function act(method: string, path: string, body: unknown, success: string) {
    const result = await call(method, path, body);
    setMessage({ ok: result.ok, text: result.ok ? success : failureText(result) });
    setTick((value) => value + 1);
  }

  const isAdvisor = person === "advisor";
  const service = services.find((item) => item.id === serviceId);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.3fr) minmax(0, 1fr)", gap: 24, alignItems: "start" }}>
      <div>
        <div style={{ ...card, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <label>
            <strong>Signed in as</strong>{" "}
            <select value={person} onChange={(event) => { setPerson(event.target.value as Person); setMessage(null); }}>
              {(Object.keys(PEOPLE) as Person[]).map((key) => <option key={key} value={key}>{PEOPLE[key]}</option>)}
            </select>
          </label>
          <button style={tab === "book" ? primary : undefined} onClick={() => setTab("book")}>Book an appointment</button>
          <button style={tab === "mine" ? primary : undefined} onClick={() => setTab("mine")}>
            {isAdvisor ? "Bookings with me" : "My bookings"}
          </button>
          <button onClick={() => act("POST", "/api/reset", undefined, "Your workspace was reset to the starting data.")}>Start over</button>
          {remaining !== null ? <span title="From the X-RateLimit-Remaining header">Requests left this minute: <strong>{remaining}</strong></span> : null}
        </div>

        {message ? (
          <p role="status" style={{ ...card, borderColor: message.ok ? "#86efac" : "#fca5a5", background: message.ok ? "#f0fdf4" : "#fef2f2" }}>
            {message.text}
          </p>
        ) : null}

        {tab === "book" ? (
          <>
            <div style={card}>
              <label>
                <strong>Service</strong>{" "}
                <select value={serviceId} onChange={(event) => setServiceId(event.target.value)}>
                  {services.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                </select>
              </label>{" "}
              <label>
                <strong>Day (UTC)</strong>{" "}
                <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
              </label>
              {service ? (
                <p style={{ marginBottom: 0 }}>
                  {service.description}<br />
                  <small><strong>Who can book:</strong> {service.eligibility}</small>
                </p>
              ) : null}
            </div>
            {slots.length === 0 ? <p>No appointment times on this day. Try another day.</p> : null}
            {slots.map((slot) => {
              const state = slot.status !== "open" ? "Closed" : slot.available ? "Available" : "Booked";
              return (
                <div key={slot.id} style={{ ...card, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                  <div>
                    <strong>{timeRange(slot.startsAt, slot.endsAt)}</strong>
                    <div style={{ color: "#526879" }}>
                      with {slot.advisorName} · {slot.room ?? "room to be announced"} · <em>{state}</em>
                    </div>
                  </div>
                  {isAdvisor ? (
                    <button onClick={() => act("PATCH", `/api/slots/${slot.id}`, { status: slot.status === "open" ? "closed" : "open" },
                      slot.status === "open" ? "Slot closed." : "Slot reopened.")}>
                      {slot.status === "open" ? "Close slot" : "Reopen slot"}
                    </button>
                  ) : (
                    <button style={primary} disabled={state !== "Available"}
                      onClick={() => act("POST", "/api/bookings", { slotId: slot.id }, "Booked! Check “My bookings”.")}>
                      Book
                    </button>
                  )}
                </div>
              );
            })}
          </>
        ) : (
          <>
            {bookings.length === 0 ? <p>No bookings yet.</p> : null}
            {bookings.map((booking) => (
              <div key={booking.id} style={{ ...card, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                <div>
                  <strong>{booking.slot.serviceName}</strong>
                  <div style={{ color: "#526879" }}>
                    {new Date(booking.slot.startsAt).toLocaleDateString([], { timeZone: "UTC" })} · {timeRange(booking.slot.startsAt, booking.slot.endsAt)} · <em>{booking.status}</em>
                  </div>
                </div>
                {booking.status === "active" ? (
                  <button onClick={() => act("PATCH", `/api/bookings/${booking.id}`, { status: "canceled" }, "Booking canceled.")}>Cancel</button>
                ) : null}
              </div>
            ))}
          </>
        )}
      </div>

      <aside style={{ position: "sticky", top: 16 }}>
        <div style={{ ...card, background: "#0f2233", color: "#d9ecff" }}>
          <h2 style={{ marginTop: 0 }}>API calls this page made</h2>
          <p style={{ marginTop: 0 }}>Every button here sends a request to the API. Click one to see it.</p>
          <div style={{ maxHeight: "70vh", overflow: "auto" }}>
            {log.length === 0 ? <p>Nothing yet.</p> : null}
            {log.map((entry, index) => (
              <div key={`${entry.at}-${index}`} style={{ borderTop: "1px solid #29445c", padding: "6px 0" }}>
                <button
                  onClick={() => setSelectedLog(selectedLog === index ? null : index)}
                  style={{ all: "unset", cursor: "pointer", display: "flex", gap: 8, alignItems: "center", width: "100%", fontFamily: "monospace", fontSize: 13 }}
                >
                  <StatusBadge result={entry} />
                  <span style={{ overflowWrap: "anywhere" }}>{entry.method} {entry.url.replace(window.location.origin, "")}</span>
                </button>
                {selectedLog === index ? (
                  <div style={{ background: "white", color: "#183044", borderRadius: 8, padding: 10, marginTop: 6 }}>
                    <RequestView result={entry} />
                    <ResponseView result={entry} />
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      </aside>
    </div>
  );
}

export default function AdvisingApp() {
  const { credentials, ready, setCredentials } = useCredentials();
  return (
    <main style={{ maxWidth: 1180, margin: "32px auto", padding: "0 24px 64px" }}>
      <p><a href="/">← Home</a> · <a href="/explorer">API explorer</a></p>
      <h1>Campus advising</h1>
      <p style={{ lineHeight: 1.6 }}>
        A small booking website built on the same API you are investigating. Sign in as a student to book and cancel
        appointments, or as an advisor to open and close times. Notice that the website itself stores nothing: it only
        calls the API, shown on the right.
      </p>
      {ready ? <CredentialsPanel credentials={credentials} onChange={setCredentials} /> : null}
      {credentials ? <App key={credentials.apiKey} credentials={credentials} /> : null}
    </main>
  );
}
