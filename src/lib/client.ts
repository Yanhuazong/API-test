export type Identity = "none" | "studentA" | "studentB" | "advisor" | "invalid";

export const IDENTITY_LABELS: Record<Identity, string> = {
  none: "No user token",
  studentA: "Student A (Avery)",
  studentB: "Student B (Bailey)",
  advisor: "Advisor (Casey)",
  invalid: "A made-up (invalid) token",
};

export interface Credentials {
  apiKey: string;
  tokens: { studentA: string; studentB: string; advisor: string };
  manifest: Record<string, string>;
}

const STORAGE_KEY = "api-investigation-credentials";

export function loadCredentials(): Credentials | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Credentials) : null;
  } catch {
    return null;
  }
}

export function saveCredentials(credentials: Credentials | null): void {
  if (credentials) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(credentials));
  else sessionStorage.removeItem(STORAGE_KEY);
}

export function parseHandout(text: string): Credentials {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("That is not valid JSON. Paste the whole contents of your handout file.");
  }
  const record = data as {
    apiKey?: unknown;
    tokens?: { studentA?: unknown; studentB?: unknown; advisor?: unknown };
    manifest?: Record<string, string>;
  };
  const { studentA, studentB, advisor } = record.tokens ?? {};
  if (
    typeof record.apiKey !== "string" ||
    typeof studentA !== "string" ||
    typeof studentB !== "string" ||
    typeof advisor !== "string"
  ) {
    throw new Error("The handout must contain apiKey and tokens.studentA, studentB and advisor.");
  }
  return { apiKey: record.apiKey, tokens: { studentA, studentB, advisor }, manifest: record.manifest ?? {} };
}

export interface SendOptions {
  method: string;
  path: string;
  identity: Identity;
  sendKey: boolean;
  contentType: string | null;
  body?: string;
}

export interface CallResult {
  method: string;
  url: string;
  requestHeaders: Record<string, string>;
  requestBody?: string;
  ok: boolean;
  status: number;
  statusText: string;
  responseHeaders: Record<string, string>;
  responseBody: string;
  ms: number;
  at: string;
  startedAt: number;
  networkError?: string;
}

const INVALID_TOKEN = "this-is-not-a-real-token-0123456789abcdef";

function mask(value: string): string {
  return value.length > 8 ? `${value.slice(0, 4)}…(hidden)` : "(hidden)";
}

export async function sendRequest(credentials: Credentials | null, options: SendOptions): Promise<CallResult> {
  const headers: Record<string, string> = {};
  const shown: Record<string, string> = {};
  if (options.sendKey && credentials) {
    headers["X-API-Key"] = credentials.apiKey;
    shown["X-API-Key"] = mask(credentials.apiKey);
  }
  if (options.identity !== "none") {
    const token = options.identity === "invalid" ? INVALID_TOKEN : credentials?.tokens[options.identity];
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
      shown["Authorization"] = `Bearer ${mask(token)}`;
    }
  }
  if (options.contentType) {
    headers["Content-Type"] = options.contentType;
    shown["Content-Type"] = options.contentType;
  }
  const url = `${window.location.origin}${options.path}`;
  const started = performance.now();
  const base = {
    method: options.method,
    url,
    requestHeaders: shown,
    requestBody: options.body,
    at: new Date().toLocaleTimeString(),
    startedAt: Date.now(),
  };
  try {
    const response = await fetch(url, { method: options.method, headers, body: options.body, cache: "no-store" });
    const responseBody = await response.text();
    const responseHeaders: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      responseHeaders[key] = value;
    });
    return {
      ...base,
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      responseHeaders,
      responseBody,
      ms: Math.round(performance.now() - started),
    };
  } catch (error) {
    return {
      ...base,
      ok: false,
      status: 0,
      statusText: "Network error",
      responseHeaders: {},
      responseBody: "",
      ms: Math.round(performance.now() - started),
      networkError: error instanceof Error ? error.message : "The request could not be sent.",
    };
  }
}

export function prettyBody(text: string): string {
  if (!text) return "";
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}

export function statusColor(status: number): string {
  if (status === 0) return "#6b7280";
  if (status < 300) return "#15803d";
  if (status < 400) return "#a16207";
  if (status < 500) return "#b45309";
  return "#b91c1c";
}
