import { evidenceFrom, type EvidenceBooking } from "@/lib/agent/claims";
import { AgentRun, PERSON_NAMES, type EngineDeps, type Person, type RestClient } from "@/lib/agent/engine";
import { defaultPolicy, naivePolicy, type Policy } from "@/lib/agent/policy";
import { ScriptedModel, type Scenario } from "@/lib/agent/scenarios";

export function scenarioPolicy(scenario: Scenario): Policy {
  return scenario.policy === "naive" ? naivePolicy() : defaultPolicy();
}

/**
 * Reset, run the scenario's setup through the public API, then hand the
 * scripted model to the same engine Live mode uses. Tool calls go through MCP.
 */
export async function runReplay(
  scenario: Scenario,
  rest: RestClient,
  deps: Omit<EngineDeps, "model" | "identity" | "lookupSlot">,
): Promise<AgentRun> {
  let script: ScriptedModel | null = null;
  const model = {
    begin: () => script?.begin(),
    next: (observation: Parameters<ScriptedModel["next"]>[0]) => {
      if (!script) throw new Error("Scenario setup did not finish.");
      return script.next(observation);
    },
  };
  const run = new AgentRun({ ...deps, model, identity: scenario.identity, lookupSlot: slotLookup(rest, scenario.identity) });
  run.say("system", "Agent console", `Scenario ${scenario.number}: ${scenario.title}. Signed in as ${PERSON_NAMES[scenario.identity]}.`);
  await run.discover();
  const data = await scenario.setup({ rest, identity: scenario.identity, note: (label, result) => run.setup(label, result) });
  script = new ScriptedModel(scenario.script(data));
  await run.run(scenario.userMessage(data));
  return run;
}

export function slotLookup(rest: RestClient, identity: Person) {
  return async (slotId: string) => {
    if (!/^[0-9a-f-]{36}$/i.test(slotId)) return null;
    const result = await rest(identity, "GET", `/api/slots/${slotId}`);
    const data = (result.body as { data?: { startsAt?: string; serviceId?: string } } | null)?.data;
    return result.status === 200 && data?.startsAt ? { startsAt: data.startsAt, serviceId: data.serviceId } : null;
  };
}

/** A fresh GET /api/bookings per identity: what actually happened, independent of the assistant. */
export async function fetchEvidence(rest: RestClient, identities: Person[]): Promise<{ bookings: EvidenceBooking[]; errors: string[]; remaining?: number }> {
  const bookings: EvidenceBooking[] = [];
  const errors: string[] = [];
  let remaining: number | undefined;
  for (const identity of identities) {
    const result = await rest(identity, "GET", "/api/bookings?limit=20");
    if (result.remaining !== undefined) remaining = result.remaining;
    if (result.status === 200) bookings.push(...evidenceFrom(identity, result.body));
    else errors.push(`GET /api/bookings as ${PERSON_NAMES[identity]} returned ${result.status}${result.errorCode ? ` ${result.errorCode}` : ""}.`);
  }
  return { bookings, errors, remaining };
}
