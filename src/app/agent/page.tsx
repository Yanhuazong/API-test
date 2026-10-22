import type { Metadata } from "next";
import AgentConsole from "@/components/AgentConsole";
import { liveModeStatus } from "@/lib/agent/liveStatus";

export const metadata: Metadata = { title: "Agent lab (instructor demo) · API Investigation", robots: { index: false } };
export const dynamic = "force-dynamic";

export default function AgentPage() {
  const status = liveModeStatus();
  return <AgentConsole liveAvailable={status.enabled} liveModel={status.model} />;
}
