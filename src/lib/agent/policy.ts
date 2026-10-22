import { TOOL_NAMES, type ToolName } from "@/lib/agent/catalog";

export type PolicySetting = "allowed" | "ask" | "blocked";
export type Policy = Record<ToolName, PolicySetting>;
export type PolicyDecision = "ALLOWED" | "ASK FIRST" | "BLOCKED BY POLICY";

export const POLICY_LABELS: Record<PolicySetting, string> = { allowed: "Allowed", ask: "Ask first", blocked: "Blocked" };

export function defaultPolicy(): Policy {
  return {
    list_services: "allowed",
    search_available_slots: "allowed",
    get_my_bookings: "allowed",
    get_booking: "allowed",
    create_booking: "ask",
    cancel_booking: "ask",
    close_slot: "ask",
    reset_workspace: "blocked",
  };
}

/** The "naive" configuration used for contrast: every tool runs without asking. */
export function naivePolicy(): Policy {
  return Object.fromEntries(TOOL_NAMES.map((name) => [name, "allowed"])) as Policy;
}

/** Unknown tool names are blocked: the app only runs tools it has a rule for. */
export function decide(policy: Policy, tool: string): PolicyDecision {
  const setting = (policy as Record<string, PolicySetting | undefined>)[tool];
  if (setting === "allowed") return "ALLOWED";
  if (setting === "ask") return "ASK FIRST";
  return "BLOCKED BY POLICY";
}
