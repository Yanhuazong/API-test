import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { TOOL_NAMES } from "../src/lib/agent/catalog";
import { checkClaim } from "../src/lib/agent/claims";
import { MCP_PROTOCOL_VERSION, mcpExecutor, restClient, secretsOf, type LabCredentials } from "../src/lib/agent/connections";
import type { RunState } from "../src/lib/agent/engine";
import { logToCsv, logToJson } from "../src/lib/agent/exportLog";
import { fetchEvidence, runReplay, scenarioPolicy } from "../src/lib/agent/replay";
import { SCENARIOS, scenarioById, type ScenarioId } from "../src/lib/agent/scenarios";
import { apiBase, installFixtureHooks, lab, resetWorkspace } from "./fixture";

function credentials(): LabCredentials {
  return { apiKey: lab.key, tokens: lab.tokens };
}

async function connect(headers: Record<string, string>): Promise<Client> {
  const client = new Client({ name: "agent-test", version: "1.0.0" }, { versionNegotiation: { mode: { pin: MCP_PROTOCOL_VERSION } } });
  await client.connect(new StreamableHTTPClientTransport(new URL("/api/mcp", apiBase), { requestInit: { headers } }));
  return client;
}

const approvals: Record<ScenarioId, boolean[]> = {
  "happy-path": [true],
  ambiguous: [],
  "conflict-naive": [],
  "conflict-guarded": [true, false],
  "someone-else": [true],
  "timeout-retry": [true, true],
  "hidden-instructions": [],
};

async function replay(id: ScenarioId) {
  const scenario = scenarioById(id);
  const creds = credentials();
  const rest = restClient(apiBase, creds);
  const executor = mcpExecutor(apiBase, creds, scenario.identity);
  const queue = [...approvals[id]];
  let state: RunState | null = null;
  let asked = 0;
  try {
    await runReplay(scenario, rest, {
      executor,
      policy: () => scenarioPolicy(scenario),
      secrets: secretsOf(creds),
      approve: async () => {
        asked += 1;
        const decision = queue.shift();
        assert.notEqual(decision, undefined, `unexpected approval card in ${id}`);
        return decision as boolean;
      },
      gate: async () => {},
      onChange: (next) => { state = next; },
    });
  } finally {
    await executor.close();
  }
  const final = state as unknown as RunState;
  const evidence = await fetchEvidence(rest, scenario.evidenceFor);
  const report = checkClaim({ finalText: final.finalText, userMessage: final.userMessage, executed: final.executed, evidence: evidence.bookings });
  return { scenario, state: final, evidence, report, asked, remainingApprovals: queue.length };
}

describe("MCP server and agent lab", () => {
  installFixtureHooks();
  beforeEach(async () => resetWorkspace());

  it("lists 8 strict tools with annotations, 1 resource, and 1 prompt", async () => {
    const client = await connect({ "X-API-Key": lab.key, Authorization: `Bearer ${lab.tokens.studentB}` });
    try {
      assert.equal(client.getProtocolEra(), "modern");
      assert.equal(client.getNegotiatedProtocolVersion(), MCP_PROTOCOL_VERSION);
      const { tools } = await client.listTools();
      assert.deepEqual(tools.map((tool) => tool.name), [...TOOL_NAMES]);
      for (const tool of tools) {
        assert.equal(tool.inputSchema.type, "object");
        assert.equal((tool.inputSchema as { additionalProperties?: boolean }).additionalProperties, false, `${tool.name} must reject extra fields`);
        assert.ok(tool.description && tool.description.length > 20);
      }
      const byName = Object.fromEntries(tools.map((tool) => [tool.name, tool]));
      assert.deepEqual(Object.keys(byName.create_booking.inputSchema.properties ?? {}), ["slotId"]);
      assert.deepEqual(byName.create_booking.inputSchema.required, ["slotId"]);
      assert.match(byName.search_available_slots.description ?? "", /UTC calendar date/);
      assert.match(byName.search_available_slots.description ?? "", /startsAt.*UTC/);
      assert.equal(Object.keys(byName.get_my_bookings.inputSchema.properties ?? {}).some((key) => /student/i.test(key)), false);
      for (const name of ["list_services", "search_available_slots", "get_my_bookings", "get_booking"]) assert.equal(byName[name].annotations?.readOnlyHint, true);
      assert.equal(byName.reset_workspace.annotations?.destructiveHint, true);
      assert.equal(byName.cancel_booking.annotations?.idempotentHint, true);
      assert.equal(byName.create_booking.annotations?.readOnlyHint, false);

      const { resources } = await client.listResources();
      assert.equal(resources.length, 1);
      const resource = await client.readResource({ uri: resources[0].uri });
      assert.match(JSON.stringify(resource.contents), /cancel/i);
      const { prompts } = await client.listPrompts();
      assert.equal(prompts.length, 1);
      const prompt = await client.getPrompt({ name: prompts[0].name, arguments: { service: "Course Planning Chat" } });
      assert.match(JSON.stringify(prompt.messages), /Course Planning Chat/);

      const smuggled = await client.callTool({ name: "create_booking", arguments: { slotId: lab.manifest.availableSlotId, studentId: lab.manifest.studentAUserId } });
      assert.equal(smuggled.isError, true);
    } finally {
      await client.close();
    }
  });

  it("forwards credentials to the real API without echoing them, and the API decides 401", async () => {
    const client = await connect({ "X-API-Key": lab.key, Authorization: `Bearer ${lab.tokens.studentB}` });
    const anonymous = await connect({});
    try {
      const result = await client.callTool({ name: "get_my_bookings", arguments: {} });
      const text = JSON.stringify(result);
      assert.equal(text.includes(lab.key), false);
      assert.equal(text.includes(lab.tokens.studentB), false);
      assert.equal((result.structuredContent as { httpStatus: number }).httpStatus, 200);
      const denied = await anonymous.callTool({ name: "list_services", arguments: {} });
      assert.equal((denied.structuredContent as { httpStatus: number; errorCode: string }).httpStatus, 401);
      assert.equal((denied.structuredContent as { errorCode: string }).errorCode, "API_KEY_REQUIRED");
    } finally {
      await client.close();
      await anonymous.close();
    }
  });

  for (const scenario of SCENARIOS) {
    it(`replay ${scenario.number} ${scenario.id} produces the expected real status codes`, async () => {
      const { state, report, evidence, remainingApprovals } = await replay(scenario.id);
      assert.equal(state.status, "finished", JSON.stringify(state.trace.at(-1)));
      assert.equal(state.trace[0].kind, "discovery");
      assert.deepEqual(state.executed.map((call) => call.outcome.httpStatus), scenario.expectedStatuses);
      assert.equal(remainingApprovals, 0);
      assert.equal(evidence.errors.length, 0);
      const secrets = secretsOf(credentials());
      for (const exported of [logToJson(state.log, secrets), logToCsv(state.log, secrets), JSON.stringify(state)]) {
        for (const secret of secrets) assert.equal(exported.includes(secret), false);
      }

      if (scenario.id === "conflict-naive" || scenario.id === "conflict-guarded") {
        assert.equal(state.executed[1].outcome.errorCode, "SLOT_UNAVAILABLE");
      }
      if (scenario.id === "conflict-naive") {
        assert.equal(report.verdict, "MISMATCH FOUND");
        assert.match(state.finalText ?? "", /^Booked \w+ 2 pm\.$/);
      }
      if (scenario.id === "conflict-guarded") {
        assert.equal(state.log.at(-1)?.approvalStatus, "denied");
        assert.equal(report.verdict, "CLAIM MATCHES EVIDENCE");
      }
      if (scenario.id === "happy-path") {
        assert.equal(report.verdict, "CLAIM MATCHES EVIDENCE");
        assert.equal(evidence.bookings.filter((booking) => booking.status === "active").length, 1);
      }
      if (scenario.id === "someone-else") {
        assert.equal(state.executed[0].outcome.errorCode, "BOOKING_FORBIDDEN");
        assert.equal(state.executed[0].approval, "approved");
        const avery = evidence.bookings.find((booking) => booking.id === lab.manifest.studentABookingId);
        assert.equal(avery?.status, "active");
      }
      if (scenario.id === "timeout-retry") {
        const cancels = state.executed.filter((call) => call.tool === "cancel_booking");
        assert.equal(cancels.length, 2);
        const first = cancels[0].outcome.data as { canceledAt: string };
        const second = cancels[1].outcome.data as { canceledAt: string };
        assert.equal(second.canceledAt, first.canceledAt);
        const step = state.trace.find((entry) => entry.kind === "step" && entry.dropped);
        assert.ok(step, "the first cancel response should be marked as dropped");
        assert.equal(evidence.bookings.filter((booking) => booking.serviceName === "Course Planning Chat").length, 1);
        assert.equal(report.verdict, "CLAIM MATCHES EVIDENCE");
      }
      if (scenario.id === "hidden-instructions") {
        const blocked = state.log.find((row) => row.tool === "reset_workspace");
        assert.equal(blocked?.policyDecision, "BLOCKED BY POLICY");
        assert.equal(blocked?.requestId, null);
        assert.equal(blocked?.httpStatus, null);
        assert.ok(state.trace.some((entry) => entry.kind === "step" && entry.tampered));
      }
    });
  }
});
