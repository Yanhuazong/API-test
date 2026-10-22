import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { TOOL_NAMES, type ToolOutcome } from "../src/lib/agent/catalog";
import { checkClaim } from "../src/lib/agent/claims";
import {
  AgentRun, INJECTED_TEXT, MAX_STEPS, modelBoundResult, tamper,
  type AgentModel, type Discovery, type ModelTurn, type Observation, type RunState, type ToolExecutor,
} from "../src/lib/agent/engine";
import { executeTool } from "../src/lib/agent/execute";
import { logToCsv, logToJson } from "../src/lib/agent/exportLog";
import { buildLivePayload, LiveModel } from "../src/lib/agent/live";
import { decide, defaultPolicy, naivePolicy } from "../src/lib/agent/policy";
import { redactAuthorization, scrubText } from "../src/lib/agent/redact";

const secrets = {
  apiKey: "KEY_sdf8a7sd6f8a7sd6f8a7sd6f8a7sd6f8a7sd6f",
  token: "TOKEN_q9w8e7r6t5y4u3i2o1p0q9w8e7r6t5y41a2b",
};
const secretList = [secrets.apiKey, secrets.token];
const discovery: Discovery = {
  tools: TOOL_NAMES.map((name) => ({ name, description: `${name} tool`, inputSchema: { type: "object", properties: {}, additionalProperties: false } })),
  resources: ["advising://policy/booking"],
  prompts: ["book_advising_appointment"],
};

function scripted(turns: ModelTurn[]): AgentModel & { seen: Array<Observation | null> } {
  const seen: Array<Observation | null> = [];
  let index = 0;
  return {
    seen,
    begin() {},
    async next(observation) {
      seen.push(observation);
      return turns[Math.min(index++, turns.length - 1)];
    },
  };
}

function outcome(partial: Partial<ToolOutcome> = {}): ToolOutcome {
  return { tool: "list_services", request: { method: "GET", path: "/api/services" }, httpStatus: 200, ok: true, requestId: "req-1", rateLimitRemaining: 9, recordIds: ["s1"], data: [{ id: "s1", name: "Course Planning Chat", description: "Plan courses." }], ...partial };
}

async function runWith(model: AgentModel, executor: ToolExecutor, options: { approve?: boolean; policy?: ReturnType<typeof defaultPolicy> } = {}) {
  let state: RunState | null = null;
  const run = new AgentRun({
    executor, model, policy: () => options.policy ?? defaultPolicy(), identity: "studentB", secrets: secretList,
    approve: async () => options.approve ?? true, gate: async () => {}, onChange: (next) => { state = next; },
  });
  await run.run("test request");
  return { run, state: state as unknown as RunState };
}

describe("agent policy", () => {
  it("uses the documented defaults and blocks unknown tools", () => {
    const policy = defaultPolicy();
    for (const name of ["list_services", "search_available_slots", "get_my_bookings", "get_booking"]) assert.equal(decide(policy, name), "ALLOWED");
    for (const name of ["create_booking", "cancel_booking", "close_slot"]) assert.equal(decide(policy, name), "ASK FIRST");
    assert.equal(decide(policy, "reset_workspace"), "BLOCKED BY POLICY");
    assert.equal(decide(policy, "delete_everything"), "BLOCKED BY POLICY");
    assert.ok(TOOL_NAMES.every((name) => decide(naivePolicy(), name) === "ALLOWED"));
  });

  it("a blocked tool sends no HTTP request and logs BLOCKED without a requestId", async () => {
    let fetches = 0;
    const spyFetch: typeof fetch = async () => { fetches += 1; return new Response("{}"); };
    let calls = 0;
    const executor: ToolExecutor = {
      discover: async () => discovery,
      call: async (name, args) => { calls += 1; return executeTool("http://api.invalid", { apiKey: secrets.apiKey, authorization: `Bearer ${secrets.token}` }, name, args, spyFetch); },
    };
    const model = scripted([
      { text: "Resetting.", toolCall: { id: "t1", name: "reset_workspace", args: {} } },
      { text: "Done." },
    ]);
    const { state } = await runWith(model, executor);
    assert.equal(calls, 0);
    assert.equal(fetches, 0);
    assert.equal(state.log.length, 1);
    assert.equal(state.log[0].policyDecision, "BLOCKED BY POLICY");
    assert.equal(state.log[0].requestId, null);
    assert.equal(state.log[0].httpStatus, null);
    assert.equal(model.seen[1]?.kind, "blocked");
  });

  it("a denied approval sends no request either", async () => {
    let calls = 0;
    const executor: ToolExecutor = { discover: async () => discovery, call: async () => { calls += 1; return outcome(); } };
    const model = scripted([{ text: "Booking.", toolCall: { id: "t1", name: "create_booking", args: { slotId: "x" } } }, { text: "Okay." }]);
    const { state } = await runWith(model, executor, { approve: false });
    assert.equal(calls, 0);
    assert.equal(state.log[0].approvalStatus, "denied");
    assert.equal(state.log[0].requestId, null);
  });

  it("stops at the step limit without sending the extra call", async () => {
    let calls = 0;
    const executor: ToolExecutor = { discover: async () => discovery, call: async () => { calls += 1; return outcome(); } };
    const model = scripted([{ text: "Again.", toolCall: { id: "t", name: "list_services", args: {} } }]);
    const { state } = await runWith(model, executor);
    assert.equal(calls, MAX_STEPS);
    assert.equal(state.status, "stopped");
    assert.match(state.trace.at(-1)?.kind === "stopped" ? (state.trace.at(-1) as { reason: string }).reason : "", /8-step limit/);
  });

  it("stops on 429 and reports the wait instead of looping", async () => {
    let calls = 0;
    const executor: ToolExecutor = {
      discover: async () => discovery,
      call: async () => { calls += 1; return outcome({ httpStatus: 429, ok: false, errorCode: "RATE_LIMITED", retryAfterSeconds: 37, recordIds: [], data: undefined }); },
    };
    const model = scripted([{ text: "Listing.", toolCall: { id: "t", name: "list_services", args: {} } }]);
    const { state } = await runWith(model, executor);
    assert.equal(calls, 1);
    assert.equal(state.status, "stopped");
    assert.match(JSON.stringify(state.trace.at(-1)), /Wait 37 seconds/);
    assert.equal(model.seen.length, 1);
  });
});

describe("redaction", () => {
  it("masks bearer tokens as Bearer ••••1a2b", () => {
    assert.equal(redactAuthorization(`Bearer ${secrets.token}`), "Bearer ••••1a2b");
    assert.equal(scrubText(`header Authorization: Bearer ${secrets.token}`, []), "header Authorization: Bearer ••••1a2b");
    assert.equal(scrubText(`key=${secrets.apiKey}`, secretList).includes(secrets.apiKey), false);
  });

  it("keeps secrets out of log rows and both export formats", async () => {
    const executor: ToolExecutor = { discover: async () => discovery, call: async () => outcome({ tool: "get_booking", recordIds: [] }) };
    const model = scripted([
      { text: "Look this up.", toolCall: { id: "t1", name: "get_booking", args: { bookingId: secrets.token, note: `Bearer ${secrets.token}`, key: secrets.apiKey } } },
      { text: "Done." },
    ]);
    const { state } = await runWith(model, executor);
    const json = logToJson(state.log, secretList);
    const csv = logToCsv(state.log, secretList);
    for (const exported of [json, csv, JSON.stringify(state.log)]) {
      assert.equal(exported.includes(secrets.token), false);
      assert.equal(exported.includes(secrets.apiKey), false);
    }
    assert.match(json, /Bearer ••••1a2b/);
    assert.match(csv.split("\r\n")[0], /^timestamp,requestId,identity,tool,arguments,policyDecision,approvalStatus,httpStatus,errorCode,recordId,notes$/);
  });
});

describe("model-bound payloads", () => {
  it("labels tool results as untrusted data and simulates tampering visibly", () => {
    const text = modelBoundResult(outcome());
    assert.match(text, /^TOOL RESULT — untrusted data/);
    assert.match(JSON.stringify(tamper(outcome()).data), new RegExp(INJECTED_TEXT));
    assert.doesNotMatch(JSON.stringify(outcome().data), new RegExp(INJECTED_TEXT));
  });

  it("never sends credentials toward the model, and fails closed if one appears", async () => {
    const bodies: string[] = [];
    let turn = 0;
    const fakeFetch: typeof fetch = async (_url, init) => {
      bodies.push(String(init?.body));
      const headers = new Headers(init?.headers);
      assert.equal(headers.has("x-api-key"), false);
      assert.equal(headers.has("authorization"), false);
      turn += 1;
      const content = turn === 1
        ? [{ type: "text", text: "Listing services." }, { type: "tool_use", id: "toolu_1", name: "list_services", input: {} }]
        : [{ type: "text", text: "There are two services." }];
      return Response.json({ content, stop_reason: turn === 1 ? "tool_use" : "end_turn" });
    };
    const model = new LiveModel({ endpoint: "http://local.invalid/api/agent/live", passcode: "pass", naive: () => false, secrets: secretList, fetchImpl: fakeFetch });
    const executor: ToolExecutor = { discover: async () => discovery, call: async () => outcome() };
    const { state } = await runWith(model, executor);
    assert.equal(state.status, "finished");
    assert.equal(bodies.length, 2);
    for (const body of bodies) {
      assert.equal(body.includes(secrets.token), false);
      assert.equal(body.includes(secrets.apiKey), false);
    }
    const second = JSON.parse(bodies[1]);
    const toolResult = second.messages.at(-1).content[0];
    assert.equal(toolResult.type, "tool_result");
    assert.match(toolResult.content, /^TOOL RESULT — untrusted data/);

    assert.throws(() => buildLivePayload([{ role: "user", content: `my token is ${secrets.token}` }], discovery, false, secretList), /credential/);
  });
});

describe("claim vs. evidence", () => {
  it("flags the naive overreach: wrong service and a UTC hour presented as local time", () => {
    const report = checkClaim({
      finalText: "Booked Thursday 2 pm.",
      userMessage: "Book the Course Planning Chat on Thursday, Oct 29 at 9:00 AM.",
      executed: [{ tool: "create_booking", args: { slotId: "slot" }, approval: "not needed", outcome: outcome({ tool: "create_booking", httpStatus: 201, recordIds: ["b1"] }) }],
      evidence: [{ id: "b1", owner: "studentB", status: "active", serviceName: "Study Skills Check-in", startsAt: "2026-10-29T14:00:00.000Z", createdAt: "", canceledAt: null }],
    });
    assert.equal(report.verdict, "MISMATCH FOUND");
    assert.ok(report.checks.some((check) => check.label === "MISMATCH" && /UTC time/.test(check.text)));
    assert.ok(report.checks.some((check) => check.label === "MISMATCH" && /Study Skills/.test(check.text)));
    assert.ok(report.checks.some((check) => check.label === "WARNING"));
  });

  it("accepts an honest 'nothing changed' report", () => {
    const report = checkClaim({ finalText: "I haven't booked anything yet.", userMessage: "x", executed: [], evidence: [] });
    assert.equal(report.verdict, "CLAIM MATCHES EVIDENCE");
  });
});
