"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CredentialsPanel, useCredentials } from "@/components/Credentials";
import { TOOLS, type ToolName } from "@/lib/agent/catalog";
import { checkClaim, type ClaimReport, type EvidenceBooking } from "@/lib/agent/claims";
import { mcpExecutor, restClient, secretsOf, type LabCredentials } from "@/lib/agent/connections";
import {
  AgentRun, describeEntry, emptyRunState, MAX_STEPS, PERSON_NAMES,
  type ApprovalCard, type Faults, type Person, type RunState, type StepEntry, type TraceEntry,
} from "@/lib/agent/engine";
import { LOG_COLUMNS, logToCsv, logToJson } from "@/lib/agent/exportLog";
import { LiveModel } from "@/lib/agent/live";
import { defaultPolicy, POLICY_LABELS, type Policy, type PolicySetting } from "@/lib/agent/policy";
import { fetchEvidence, runReplay, scenarioPolicy, slotLookup } from "@/lib/agent/replay";
import { SCENARIOS, scenarioById, type ScenarioId } from "@/lib/agent/scenarios";
import { easternTime, utcTime } from "@/lib/agent/time";
import type { Credentials } from "@/lib/client";

const CSS = `
.al { font-size: 1rem; line-height: 1.5; }
.al.large { font-size: 1.4rem; }
.al h1 { font-size: 2em; margin: .3em 0; }
.al h2 { font-size: 1.35em; margin: 0 0 .5em; }
.al h3 { font-size: 1.1em; margin: 0 0 .4em; }
.al button, .al select, .al input, .al textarea { font: inherit; }
.al button { padding: .35em .8em; border-radius: .4em; border: 2px solid #1e3a5f; background: #fff; color: #10263b; cursor: pointer; }
.al button.primary { background: #0b4f8a; color: #fff; border-color: #0b4f8a; font-weight: 700; }
.al button.danger { border-color: #8f1d1d; color: #8f1d1d; font-weight: 700; }
.al button:disabled, .al button[aria-disabled=true] { opacity: .55; cursor: not-allowed; }
.al :focus-visible { outline: 3px solid #b45309; outline-offset: 2px; }
.al select, .al input[type=text], .al input[type=password], .al textarea { padding: .3em .45em; border: 2px solid #5b7489; border-radius: .35em; background: #fff; color: #10263b; }
.al .panel { background: #fff; border: 1px solid #b7c9d8; border-radius: .7em; padding: 1em; margin-bottom: 1em; }
.al .row { display: flex; flex-wrap: wrap; gap: .7em; align-items: center; }
.al .grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.25fr); gap: 1em; align-items: start; }
@media (max-width: 1000px) { .al .grid { grid-template-columns: 1fr; } }
.al .badge { display: inline-block; padding: .05em .55em; border-radius: .3em; font-weight: 800; font-size: .9em; letter-spacing: .02em; border: 2px solid currentColor; white-space: nowrap; }
.al .ok { color: #14532d; background: #e7f6ec; }
.al .ask { color: #713f12; background: #fdf3d8; }
.al .block { color: #fff; background: #7f1d1d; border-color: #7f1d1d; }
.al .reject { color: #7c2d12; background: #fde9dc; }
.al .neutral { color: #1f2f3d; background: #edf2f6; }
.al .sim { color: #4c1d95; background: #efe7fd; }
.al pre, .al code { font-family: ui-monospace, Consolas, monospace; font-size: .88em; }
.al pre { white-space: pre-wrap; overflow-wrap: anywhere; background: #f1f5f9; padding: .5em; border-radius: .35em; margin: .2em 0; }
.al dl.fields { display: grid; grid-template-columns: max-content minmax(0, 1fr); gap: .25em .8em; margin: .4em 0 0; }
.al dl.fields dt { font-weight: 700; }
.al dl.fields dd { margin: 0; overflow-wrap: anywhere; }
.al ol.trace { list-style: none; padding: 0; margin: 0; }
.al ol.trace > li { border: 2px solid #b7c9d8; border-radius: .6em; padding: .7em; margin-bottom: .7em; background: #fff; }
.al ol.trace > li.blocked { border: 4px dashed #7f1d1d; background: #fff7f7; }
.al ol.trace > li.rejected { border: 4px solid #c2410c; background: #fff8f3; }
.al .verdict { font-weight: 800; padding: .4em .6em; border-radius: .4em; margin: .4em 0; }
.al .chat { max-height: 34em; overflow: auto; }
.al .msg { padding: .45em .6em; border-radius: .5em; margin-bottom: .5em; }
.al .msg.user { background: #e8f1fb; }
.al .msg.assistant { background: #f4f1fb; }
.al .msg.system { background: #f3f4f6; font-style: italic; }
.al .approval { border: 4px solid #a16207; background: #fffbeb; border-radius: .6em; padding: .8em; margin: .6em 0; }
.al table { border-collapse: collapse; width: 100%; font-size: .9em; }
.al th, .al td { border: 1px solid #b7c9d8; padding: .3em .45em; text-align: left; vertical-align: top; overflow-wrap: anywhere; }
.al th { background: #eaf1f7; }
.al .scroll { overflow-x: auto; }
.al .scroll table.wide { min-width: 60em; }
.al .stack > * + * { margin-top: 1em; }
.al .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); border: 0; }
.al .muted { color: #3f5568; }
.al .tabs button[aria-pressed=true] { background: #0b4f8a; color: #fff; }
`;

const DECISION_CLASS: Record<string, string> = { ALLOWED: "ok", "ASK FIRST": "ask", "BLOCKED BY POLICY": "block" };

function Badge({ kind, children }: { kind: string; children: React.ReactNode }) {
  return <span className={`badge ${kind}`}>{children}</span>;
}

function statusBadge(status: number, code?: string) {
  const kind = status >= 200 && status < 300 ? "ok" : status === 0 ? "neutral" : "reject";
  return <Badge kind={kind}>{status === 0 ? "NO RESPONSE" : status}{code ? ` ${code}` : ""}</Badge>;
}

function hintsOf(name: string): string[] {
  const tool = TOOLS.find((item) => item.name === name);
  if (!tool) return [];
  return [
    tool.annotations.readOnlyHint ? "read-only" : "changes data",
    ...(tool.annotations.destructiveHint ? ["destructive"] : []),
    ...(tool.annotations.idempotentHint && !tool.annotations.readOnlyHint ? ["idempotent"] : []),
  ];
}

function toLab(credentials: Credentials): LabCredentials {
  return { apiKey: credentials.apiKey, tokens: { studentA: credentials.tokens.studentA, studentB: credentials.tokens.studentB, advisor: credentials.tokens.advisor } };
}

function download(name: string, type: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

function StepView({ entry }: { entry: StepEntry }) {
  const response = entry.response;
  const sent = Boolean(entry.request);
  return (
    <>
      <h3>
        Step {entry.step}: <code>{entry.proposal.name}</code>{" "}
        {entry.outcome === "blocked" ? <Badge kind="block">BLOCKED BY OUR APP&apos;S POLICY</Badge> : null}
        {entry.outcome === "rejected" ? <Badge kind="reject">REJECTED BY THE API</Badge> : null}
        {entry.outcome === "denied" ? <Badge kind="ask">DENIED BY THE STUDENT</Badge> : null}
        {entry.outcome === "timeout" ? <Badge kind="sim">TIMEOUT (SIMULATED)</Badge> : null}
      </h3>
      {entry.outcome === "blocked" ? (
        <p><strong>Stopped inside our app before any request.</strong> The API never saw this call.</p>
      ) : null}
      {entry.outcome === "rejected" && response ? (
        <p><strong>The request reached the API, and the API refused it</strong> ({response.status} {response.errorCode}). The server enforced this, not the model.</p>
      ) : null}
      <dl className="fields">
        {entry.modelText ? (<><dt>Model said</dt><dd>{entry.modelText}</dd></>) : null}
        <dt>Model proposed</dt>
        <dd><code>{entry.proposal.name}</code><pre>{JSON.stringify(entry.proposal.args, null, 2)}</pre></dd>
        <dt>Policy decision</dt>
        <dd><Badge kind={DECISION_CLASS[entry.decision]}>{entry.decision}</Badge></dd>
        <dt>Approval</dt>
        <dd>{entry.approval}</dd>
        <dt>HTTP request sent</dt>
        <dd>{sent && entry.request ? <code>{entry.request.method} {entry.request.path}</code> : <strong>None. No request reached the API.</strong>}</dd>
        <dt>Response</dt>
        <dd>
          {sent && response ? (
            <>
              {statusBadge(response.status, response.errorCode)}
              {response.recordIds.length ? <> · record <code>{response.recordIds[0]}</code>{response.recordIds.length > 1 ? ` (+${response.recordIds.length - 1} more)` : ""}</> : null}
              {response.remaining !== undefined ? <> · {response.remaining} requests left this minute</> : null}
              {response.requestId ? <> · requestId <code>{response.requestId}</code></> : null}
              {entry.dropped ? (
                <p><Badge kind="sim">SIMULATED DROPPED RESPONSE</Badge> The API answered, but the agent layer hid this response. The assistant saw a timeout.</p>
              ) : null}
            </>
          ) : entry.outcome === "invalid" && response ? `Rejected by the tool schema: ${response.errorMessage}` : entry.outcome === "pending" ? "Waiting…" : "None"}
        </dd>
        {entry.tampered ? (
          <>
            <dt>Tampered</dt>
            <dd><Badge kind="sim">SIMULATED TAMPERED CONTENT</Badge> Added by this demo&apos;s agent layer, not by the API: <q>{entry.tampered}</q></dd>
          </>
        ) : null}
        {entry.modelSaw ? (
          <>
            <dt>Model saw</dt>
            <dd><details><summary>Show the exact text passed to the model</summary><pre>{entry.modelSaw}</pre></details></dd>
          </>
        ) : null}
        <dt>Model&apos;s next message</dt>
        <dd>{entry.nextMessage ?? "—"}</dd>
      </dl>
    </>
  );
}

function TraceItem({ entry, policy }: { entry: TraceEntry; policy: Policy }) {
  if (entry.kind === "discovery") {
    return (
      <li>
        <h3>Discovery: tools learned from the MCP server</h3>
        <p>The assistant did not know these in advance. It asked <code>/api/mcp</code> for <code>tools/list</code>.</p>
        <ul>
          {entry.discovery.tools.map((tool) => (
            <li key={tool.name}>
              <code>{tool.name}</code> <span className="muted">({hintsOf(tool.name).join(", ")})</span>{" "}
              <Badge kind={DECISION_CLASS[policy[tool.name as ToolName] === "allowed" ? "ALLOWED" : policy[tool.name as ToolName] === "ask" ? "ASK FIRST" : "BLOCKED BY POLICY"]}>
                {POLICY_LABELS[policy[tool.name as ToolName] ?? "blocked"].toUpperCase()}
              </Badge>
            </li>
          ))}
        </ul>
        <p className="muted">Also offered: {entry.discovery.resources.length} resource ({entry.discovery.resources.join(", ")}) and {entry.discovery.prompts.length} prompt ({entry.discovery.prompts.join(", ")}).</p>
      </li>
    );
  }
  if (entry.kind === "setup") {
    return (
      <li>
        <h3><Badge kind="neutral">SETUP</Badge> {entry.label}</h3>
        <p className="muted">Sent by the console, not by the assistant.</p>
        {entry.request ? <p><code>{entry.request.method} {entry.request.path}</code> {statusBadge(entry.status ?? 0, entry.errorCode)}{entry.remaining !== undefined ? ` · ${entry.remaining} requests left this minute` : ""}</p> : null}
      </li>
    );
  }
  if (entry.kind === "final") {
    return <li><h3><Badge kind="neutral">FINAL MESSAGE</Badge></h3><p>{entry.text}</p></li>;
  }
  if (entry.kind === "stopped") {
    return <li className="blocked"><h3><Badge kind="block">STOPPED</Badge></h3><p>{entry.reason}</p></li>;
  }
  return <li className={entry.outcome === "blocked" ? "blocked" : entry.outcome === "rejected" ? "rejected" : undefined}><StepView entry={entry} /></li>;
}

function ApprovalView({ card, utcOnly, onDecide }: { card: ApprovalCard; utcOnly: boolean; onDecide: (approved: boolean) => void }) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, [card.stepId]);
  return (
    <section className="approval" aria-labelledby="approval-heading">
      <h3 id="approval-heading" ref={heading} tabIndex={-1}><Badge kind="ask">ASK FIRST</Badge> Approval needed</h3>
      <dl className="fields">
        <dt>Action</dt><dd>{card.action}</dd>
        <dt>Tool call</dt><dd><code>{card.tool}</code> <code>{JSON.stringify(card.args)}</code></dd>
        <dt>Affected record</dt><dd>{card.record}{!utcOnly && card.serviceName ? ` · ${card.serviceName}` : ""}</dd>
        <dt>Time</dt>
        <dd>
          {card.startsAt
            ? utcOnly ? <code>{card.startsAt}</code> : <><strong>{easternTime(card.startsAt)}</strong> (Eastern, America/Indiana/Indianapolis)<br />{utcTime(card.startsAt)}</>
            : "Not known"}
        </dd>
        {card.note ? (<><dt>Note</dt><dd>{card.note}</dd></>) : null}
      </dl>
      <div className="row" style={{ marginTop: ".6em" }}>
        <button className="primary" onClick={() => onDecide(true)}>Approve</button>
        <button className="danger" onClick={() => onDecide(false)}>Deny</button>
      </div>
    </section>
  );
}

function ClaimPanel({ report, evidence, errors, run }: { report: ClaimReport | null; evidence: EvidenceBooking[]; errors: string[]; run: RunState }) {
  const changed = new Set([
    ...run.executed.filter((call) => call.outcome.ok && call.tool === "create_booking").flatMap((call) => call.outcome.recordIds),
    ...run.executed.filter((call) => call.outcome.ok && call.tool === "cancel_booking").map((call) => String(call.args.bookingId)),
  ]);
  return (
    <section className="panel" aria-labelledby="claim-heading">
      <h2 id="claim-heading">Claim vs. evidence</h2>
      {!report ? <p>After a run ends, this compares what the assistant said with a fresh <code>GET /api/bookings</code>.</p> : (
        <>
          <div className="stack">
            <div>
              <h3>What the assistant claimed</h3>
              <p style={{ margin: 0 }}>Final sentence:</p>
              <blockquote style={{ margin: ".2em 0", fontSize: "1.1em" }}>{report.finalSentence || "(no final message)"}</blockquote>
              {report.claim && report.claim !== report.finalSentence ? <details><summary>Full final message</summary><p>{report.claim}</p></details> : null}
              <p className={`verdict ${report.verdict === "MISMATCH FOUND" ? "block" : report.verdict === "CLAIM MATCHES EVIDENCE" ? "ok" : "neutral"}`}>{report.verdict}</p>
              <ul>
                {report.checks.map((check, index) => (
                  <li key={index}><Badge kind={check.label === "MATCH" ? "ok" : check.label === "MISMATCH" ? "block" : check.label === "WARNING" ? "ask" : "neutral"}>{check.label}</Badge> {check.text}</li>
                ))}
              </ul>
            </div>
            <div>
              <h3>What the API says now</h3>
              {errors.map((error) => <p key={error} role="alert">{error}</p>)}
              <div className="scroll">
                <table className="wide">
                  <caption className="sr-only">Bookings returned by a fresh GET /api/bookings</caption>
                  <thead><tr><th scope="col">Owner</th><th scope="col">Service</th><th scope="col">Status</th><th scope="col">Eastern time</th><th scope="col">UTC time</th><th scope="col">Booking id</th><th scope="col">This run</th></tr></thead>
                  <tbody>
                    {evidence.length === 0 ? <tr><td colSpan={7}>No bookings.</td></tr> : evidence.map((booking) => (
                      <tr key={`${booking.owner}-${booking.id}`}>
                        <td>{PERSON_NAMES[booking.owner]}</td>
                        <td>{booking.serviceName}</td>
                        <td>{booking.status.toUpperCase()}</td>
                        <td>{easternTime(booking.startsAt)}</td>
                        <td>{utcTime(booking.startsAt)}</td>
                        <td><code>{booking.id}</code></td>
                        <td>{changed.has(booking.id) ? "CHANGED IN THIS RUN" : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      )}
    </section>
  );
}

type Waiter<T> = { resolve: (value: T) => void; reject: (error: Error) => void };

function Console({ credentials, liveAvailable, liveModel }: { credentials: Credentials; liveAvailable: boolean; liveModel: string }) {
  const lab = toLab(credentials);
  const secrets = secretsOf(lab);
  const [mode, setMode] = useState<"replay" | "live">("replay");
  const [identity, setIdentity] = useState<Person>("studentB");
  const [policy, setPolicyState] = useState<Policy>(defaultPolicy);
  const policyRef = useRef(policy);
  const setPolicy = (next: Policy) => { policyRef.current = next; setPolicyState(next); };
  const [utcOnly, setUtcOnly] = useState(false);
  const [scenarioId, setScenarioId] = useState<ScenarioId>("happy-path");
  const [run, setRun] = useState<RunState>(emptyRunState);
  const [busy, setBusy] = useState(false);
  const [autoRun, setAutoRun] = useState(false);
  const autoRef = useRef(autoRun);
  autoRef.current = autoRun;
  const [report, setReport] = useState<ClaimReport | null>(null);
  const [evidence, setEvidence] = useState<EvidenceBooking[]>([]);
  const [evidenceErrors, setEvidenceErrors] = useState<string[]>([]);
  const [problem, setProblem] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [passcode, setPasscode] = useState("");
  const [naive, setNaive] = useState(false);
  const naiveRef = useRef(naive);
  naiveRef.current = naive;
  const [message, setMessage] = useState("Find a Course Planning Chat time on Thursday at 9:00 AM and book it.");
  const faults = useRef<Faults>({ dropNext: false, injectNext: false });
  const [faultView, setFaultView] = useState<Faults>({ dropNext: false, injectNext: false });
  const gateWaiter = useRef<Waiter<void> | null>(null);
  const approvalWaiter = useRef<Waiter<boolean> | null>(null);
  const liveRun = useRef<{ run: AgentRun; identity: Person; close: () => Promise<void> } | null>(null);
  const announced = useRef(0);
  const nextButton = useRef<HTMLButtonElement>(null);
  const origin = typeof window === "undefined" ? "http://localhost" : window.location.origin;
  const rest = restClient(origin, lab);

  const onChange = useCallback((state: RunState) => {
    setRun(state);
    setFaultView({ ...faults.current });
    if (state.trace.length > announced.current) {
      const fresh = state.trace.slice(announced.current).filter((entry) => entry.kind !== "step" || entry.outcome !== "pending");
      if (fresh.length) {
        setAnnouncement(fresh.map(describeEntry).join(" "));
        announced.current = state.trace.length;
      }
    }
  }, []);

  const gate = useCallback(() => {
    if (autoRef.current) return Promise.resolve();
    return new Promise<void>((resolve, reject) => { gateWaiter.current = { resolve, reject }; });
  }, []);

  const approve = useCallback(() => new Promise<boolean>((resolve, reject) => { approvalWaiter.current = { resolve, reject }; }), []);

  function abortWaiters(reason: string) {
    gateWaiter.current?.reject(new Error(reason));
    approvalWaiter.current?.reject(new Error(reason));
    gateWaiter.current = null;
    approvalWaiter.current = null;
  }

  function clearRun() {
    abortWaiters("cleared");
    announced.current = 0;
    setRun(emptyRunState());
    setReport(null);
    setEvidence([]);
    setEvidenceErrors([]);
    setProblem(null);
  }

  async function collectEvidence(state: RunState, who: Person[]) {
    const result = await fetchEvidence(rest, who);
    setEvidence(result.bookings);
    setEvidenceErrors(result.errors);
    setReport(checkClaim({ finalText: state.finalText, userMessage: state.userMessage, executed: state.executed, evidence: result.bookings }));
    if (result.remaining !== undefined) setRun((current) => ({ ...current, remaining: result.remaining ?? current.remaining }));
  }

  async function startScenario() {
    const scenario = scenarioById(scenarioId);
    clearRun();
    setNotice(null);
    nextButton.current?.focus();
    setIdentity(scenario.identity);
    setPolicy(scenarioPolicy(scenario));
    setBusy(true);
    const executor = mcpExecutor(origin, lab, scenario.identity);
    let finalState: RunState | null = null;
    try {
      await runReplay(scenario, rest, {
        executor, secrets, approve, gate, faults: undefined,
        policy: () => policyRef.current,
        onChange: (state) => { finalState = state; onChange(state); },
      });
    } catch (error) {
      const text = error instanceof Error ? error.message : "The scenario failed.";
      if (text !== "cleared") setProblem(text);
    } finally {
      await executor.close().catch(() => {});
      setBusy(false);
    }
    if (finalState && ((finalState as RunState).status === "finished" || (finalState as RunState).status === "stopped")) {
      await collectEvidence(finalState, scenario.evidenceFor);
    }
  }

  async function sendLive() {
    const text = message.trim();
    if (!text) return;
    setProblem(null);
    setReport(null);
    if (!liveRun.current || liveRun.current.identity !== identity) {
      await liveRun.current?.close();
      clearRun();
      const executor = mcpExecutor(origin, lab, identity);
      const model = new LiveModel({ endpoint: "/api/agent/live", passcode, naive: () => naiveRef.current, secrets });
      const agent = new AgentRun({
        executor, model, identity, secrets, approve, gate, onChange, faults: faults.current,
        policy: () => policyRef.current, lookupSlot: slotLookup(rest, identity),
      });
      agent.say("system", "Agent console", `Live conversation started as ${PERSON_NAMES[identity]} with ${liveModel}. Output is nondeterministic.`);
      liveRun.current = { run: agent, identity, close: executor.close };
    }
    const current = liveRun.current;
    nextButton.current?.focus();
    setBusy(true);
    try {
      await current.run.run(text);
    } catch (error) {
      const reason = error instanceof Error ? error.message : "The live run failed.";
      if (reason !== "cleared") setProblem(reason);
    } finally {
      setBusy(false);
    }
    const state = current.run.state;
    if (state.status === "finished" || state.status === "stopped") await collectEvidence(structuredClone(state), [identity]);
  }

  async function newConversation() {
    await liveRun.current?.close();
    liveRun.current = null;
    clearRun();
  }

  async function resetWorkspace() {
    await newConversation();
    setBusy(true);
    const result = await rest(identity, "POST", "/api/reset");
    setBusy(false);
    setNotice(result.status === 200 ? "Workspace reset to its starting data. Trace cleared." : `Reset failed: ${result.status} ${result.errorCode ?? ""}`);
  }

  function next() {
    const waiter = gateWaiter.current;
    gateWaiter.current = null;
    waiter?.resolve();
  }

  function decide(approved: boolean) {
    const waiter = approvalWaiter.current;
    approvalWaiter.current = null;
    waiter?.resolve(approved);
    requestAnimationFrame(() => nextButton.current?.focus());
  }

  useEffect(() => () => { abortWaiters("cleared"); void liveRun.current?.close(); }, []);

  const scenario = scenarioById(scenarioId);
  const naiveActive = mode === "replay" ? scenario.policy === "naive" && run.status !== "idle" : naive;

  return (
    <>
      <section className="panel" aria-labelledby="controls-heading">
        <h2 id="controls-heading">Controls</h2>
        <div className="row tabs" role="group" aria-label="Run mode">
          <button aria-pressed={mode === "replay"} onClick={() => setMode("replay")} disabled={busy}>Replay mode</button>
          <button aria-pressed={mode === "live"} onClick={() => setMode("live")} disabled={busy}>Live mode</button>
          <label>Identity{" "}
            <select value={identity} disabled={busy || mode === "replay"} onChange={(event) => setIdentity(event.target.value as Person)}>
              {(Object.keys(PERSON_NAMES) as Person[]).map((key) => <option key={key} value={key}>{PERSON_NAMES[key]}{key === "advisor" ? " (advisor)" : " (student)"}</option>)}
            </select>
          </label>
          <label><input type="checkbox" checked={utcOnly} onChange={(event) => setUtcOnly(event.target.checked)} /> Approval card: UTC only</label>
          <label><input type="checkbox" checked={autoRun} onChange={(event) => setAutoRun(event.target.checked)} /> Run without pausing</label>
          <button className="danger" onClick={resetWorkspace} disabled={busy}>Reset workspace</button>
          <span>Requests left this minute: <strong>{run.remaining ?? "—"}</strong> <span className="muted">(10 per minute per workspace; reset is not counted)</span></span>
        </div>
        {mode === "replay" ? (
          <div style={{ marginTop: ".8em" }}>
            <div className="row">
              <label>Scenario{" "}
                <select value={scenarioId} disabled={busy} onChange={(event) => setScenarioId(event.target.value as ScenarioId)}>
                  {SCENARIOS.map((item) => <option key={item.id} value={item.id}>{item.number}. {item.title}</option>)}
                </select>
              </label>
              <button className="primary" onClick={startScenario} disabled={busy}>Start scenario (resets the workspace)</button>
            </div>
            <p>{scenario.summary} Signed in as <strong>{PERSON_NAMES[scenario.identity]}</strong>. Policy: <strong>{scenario.policy === "naive" ? "naive (every tool Allowed)" : "default"}</strong>.</p>
            <details><summary>Instructor notes: what students should notice (spoilers)</summary><ul>{scenario.watchFor.map((item) => <li key={item}>{item}</li>)}</ul></details>
          </div>
        ) : (
          <div style={{ marginTop: ".8em" }}>
            {!liveAvailable ? (
              <p role="status"><Badge kind="neutral">LIVE MODE DISABLED</Badge> The server does not have both <code>LLM_API_KEY</code> and <code>INSTRUCTOR_PASSCODE</code> set, so no model can be called. Replay mode works without them. See the agent lab guide.</p>
            ) : (
              <>
                <p><Badge kind="sim">NONDETERMINISTIC</Badge> A real model ({liveModel}) plans the calls. The same request can produce different steps each time.</p>
                <div className="row">
                  <label>Instructor passcode <input type="password" value={passcode} onChange={(event) => setPasscode(event.target.value)} autoComplete="off" /></label>
                  <label><input type="checkbox" checked={naive} disabled={busy} onChange={(event) => { setNaive(event.target.checked); setPolicy(event.target.checked ? Object.fromEntries(TOOLS.map((tool) => [tool.name, "allowed"])) as Policy : defaultPolicy()); }} /> Naive configuration (all tools Allowed, “complete the task without asking”)</label>
                </div>
                <div className="row" style={{ marginTop: ".5em" }}>
                  <label><input type="checkbox" checked={faultView.dropNext} onChange={(event) => { faults.current.dropNext = event.target.checked; setFaultView({ ...faults.current }); }} /> Drop the next response (simulated timeout)</label>
                  <label><input type="checkbox" checked={faultView.injectNext} onChange={(event) => { faults.current.injectNext = event.target.checked; setFaultView({ ...faults.current }); }} /> Inject tampered text into the next result</label>
                </div>
                <label style={{ display: "block", marginTop: ".5em" }}>Message from {PERSON_NAMES[identity]}
                  <textarea rows={2} style={{ display: "block", width: "100%", boxSizing: "border-box" }} value={message} onChange={(event) => setMessage(event.target.value)} />
                </label>
                <div className="row" style={{ marginTop: ".5em" }}>
                  <button className="primary" onClick={sendLive} disabled={busy || !passcode}>Send to the assistant</button>
                  <button onClick={newConversation} disabled={busy}>New conversation</button>
                </div>
              </>
            )}
          </div>
        )}
        <div className="row" style={{ marginTop: ".8em" }}>
          <button ref={nextButton} className="primary" onClick={next} aria-disabled={!run.waitingFor || Boolean(run.pendingApproval)}>
            Next step{run.waitingFor ? `: ${run.waitingFor}` : ""}
          </button>
          <span className="muted">Max {MAX_STEPS} steps per request. {run.status === "idle" ? "" : `Status: ${run.status.toUpperCase()}.`}</span>
          {naiveActive ? <Badge kind="block">NAIVE CONFIGURATION ACTIVE</Badge> : null}
        </div>
        {problem ? <p role="alert"><Badge kind="block">ERROR</Badge> {problem}</p> : null}
        {notice ? <p role="status">{notice}</p> : null}
      </section>

      <section className="panel" aria-labelledby="policy-heading">
        <h2 id="policy-heading">Policy (enforced by this app before any request)</h2>
        <div className="scroll">
          <table>
            <caption className="sr-only">Tool policy</caption>
            <thead><tr><th scope="col">Tool</th><th scope="col">Hints from the server</th><th scope="col">Setting</th></tr></thead>
            <tbody>
              {TOOLS.map((tool) => (
                <tr key={tool.name}>
                  <th scope="row"><code>{tool.name}</code></th>
                  <td>{hintsOf(tool.name).join(", ")}</td>
                  <td>
                    <label className="sr-only" htmlFor={`policy-${tool.name}`}>Policy for {tool.name}</label>
                    <select id={`policy-${tool.name}`} value={policy[tool.name]} onChange={(event) => setPolicy({ ...policyRef.current, [tool.name]: event.target.value as PolicySetting })}>
                      {(Object.keys(POLICY_LABELS) as PolicySetting[]).map((key) => <option key={key} value={key}>{POLICY_LABELS[key]}</option>)}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="sr-only" aria-live="polite" aria-atomic="true">{announcement}</div>

      <div className="grid">
        <section className="panel" aria-labelledby="chat-heading">
          <h2 id="chat-heading">Chat</h2>
          <div className="chat">
            {run.chat.length === 0 ? <p className="muted">Start a scenario or send a message.</p> : null}
            {run.chat.map((item) => (
              <div key={item.id} className={`msg ${item.role}`}>
                <strong>{item.speaker}:</strong> {item.text}
              </div>
            ))}
          </div>
          {run.pendingApproval ? <ApprovalView card={run.pendingApproval} utcOnly={utcOnly} onDecide={decide} /> : null}
        </section>
        <section className="panel" aria-labelledby="trace-heading">
          <h2 id="trace-heading">Trace timeline</h2>
          <p className="muted">
            Legend: <Badge kind="block">BLOCKED BY OUR APP&apos;S POLICY</Badge> = stopped here, dashed border, no request. <Badge kind="reject">REJECTED BY THE API</Badge> = request sent, server said no, solid border.
          </p>
          {run.trace.length === 0 ? <p className="muted">No steps yet.</p> : (
            <ol className="trace">
              {run.trace.map((entry) => <TraceItem key={entry.id} entry={entry} policy={policy} />)}
            </ol>
          )}
        </section>
      </div>

      <ClaimPanel report={report} evidence={evidence} errors={evidenceErrors} run={run} />

      <section className="panel" aria-labelledby="log-heading">
        <h2 id="log-heading">Log: one row per tool call</h2>
        <div className="row" style={{ marginBottom: ".5em" }}>
          <button onClick={() => download(`agent-log-${Date.now()}.json`, "application/json", logToJson(run.log, secrets))} disabled={!run.log.length}>Export JSON</button>
          <button onClick={() => download(`agent-log-${Date.now()}.csv`, "text/csv", logToCsv(run.log, secrets))} disabled={!run.log.length}>Export CSV</button>
          <span className="muted">Exports never contain the API key or tokens. Identity is a name only.</span>
        </div>
        <div className="scroll">
          <table className="wide">
            <caption className="sr-only">Tool call log</caption>
            <thead><tr>{LOG_COLUMNS.map((column) => <th key={column.key} scope="col">{column.label}</th>)}</tr></thead>
            <tbody>
              {run.log.length === 0 ? <tr><td colSpan={LOG_COLUMNS.length}>No tool calls yet.</td></tr> : run.log.map((row, index) => (
                <tr key={index}>
                  <td>{new Date(row.timestamp).toLocaleTimeString()}</td>
                  <td>{row.requestId ? <code>{row.requestId}</code> : "none (no request)"}</td>
                  <td>{row.identity}</td>
                  <td><code>{row.tool}</code></td>
                  <td><code>{row.arguments}</code></td>
                  <td><Badge kind={DECISION_CLASS[row.policyDecision]}>{row.policyDecision}</Badge></td>
                  <td>{row.approvalStatus}</td>
                  <td>{row.httpStatus ?? "—"}</td>
                  <td>{row.errorCode ?? "—"}</td>
                  <td>{row.recordId ? <code>{row.recordId}</code> : "—"}</td>
                  <td>{row.notes || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

export default function AgentConsole({ liveAvailable, liveModel }: { liveAvailable: boolean; liveModel: string }) {
  const { credentials, ready, setCredentials } = useCredentials();
  const [large, setLarge] = useState(false);
  useEffect(() => {
    try { setLarge(localStorage.getItem("agent-lab-large-text") === "1"); } catch { /* storage unavailable */ }
  }, []);
  function toggleLarge() {
    setLarge((value) => {
      try { localStorage.setItem("agent-lab-large-text", value ? "0" : "1"); } catch { /* storage unavailable */ }
      return !value;
    });
  }
  return (
    <main className={`al${large ? " large" : ""}`} style={{ maxWidth: large ? 1600 : 1320, margin: "24px auto", padding: "0 16px 64px" }}>
      <style>{CSS}</style>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <p style={{ margin: 0 }}><a href="/">← Home</a></p>
        <button aria-pressed={large} onClick={toggleLarge}>Large text: {large ? "ON" : "OFF"}</button>
      </div>
      <h1>Agent lab <Badge kind="neutral">INSTRUCTOR DEMO</Badge></h1>
      <p style={{ maxWidth: "60em" }}>
        An AI assistant operates the same advising API through an MCP server at <code>/api/mcp</code>. It is just another API client:
        every tool call is a real request with the workspace key and identity token, which this console attaches and the model never sees.
        Watch what the assistant proposes, what our app allows, what the API actually returns, and whether the final claim is true.
      </p>
      {ready ? <CredentialsPanel credentials={credentials} onChange={setCredentials} /> : null}
      {credentials ? <Console key={credentials.apiKey} credentials={credentials} liveAvailable={liveAvailable} liveModel={liveModel} /> : null}
    </main>
  );
}
