import type { LogRow } from "@/lib/agent/engine";
import { scrubText } from "@/lib/agent/redact";

export const LOG_COLUMNS: Array<{ key: keyof LogRow; label: string }> = [
  { key: "timestamp", label: "timestamp" },
  { key: "requestId", label: "requestId" },
  { key: "identity", label: "identity" },
  { key: "tool", label: "tool" },
  { key: "arguments", label: "arguments" },
  { key: "policyDecision", label: "policyDecision" },
  { key: "approvalStatus", label: "approvalStatus" },
  { key: "httpStatus", label: "httpStatus" },
  { key: "errorCode", label: "errorCode" },
  { key: "recordId", label: "recordId" },
  { key: "notes", label: "notes" },
];

/** Exports are scrubbed again at the boundary, so a secret can never ride along in any field. */
export function logToJson(rows: LogRow[], secrets: readonly string[]): string {
  return scrubText(JSON.stringify(rows, null, 2), secrets);
}

function csvCell(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function logToCsv(rows: LogRow[], secrets: readonly string[]): string {
  const lines = [LOG_COLUMNS.map((column) => column.label).join(",")];
  for (const row of rows) lines.push(LOG_COLUMNS.map((column) => csvCell(row[column.key])).join(","));
  return scrubText(lines.join("\r\n"), secrets);
}
