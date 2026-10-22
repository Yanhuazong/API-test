// Secrets never leave the tab in readable form: logs, exports, and anything
// sent toward a model are scrubbed with these helpers.

export function maskSecret(secret: string): string {
  return `••••${secret.slice(-4)}`;
}

export function redactAuthorization(value: string): string {
  const match = /^Bearer\s+(\S+)$/i.exec(value.trim());
  return match ? `Bearer ${maskSecret(match[1])}` : maskSecret(value);
}

/** Replace every known secret, and anything shaped like a bearer token, in text. */
export function scrubText(text: string, secrets: readonly string[]): string {
  let result = text;
  for (const secret of secrets) {
    if (secret) result = result.split(secret).join(maskSecret(secret));
  }
  return result.replace(/Bearer\s+(?!••••)([A-Za-z0-9._~+/=-]{8,})/g, (_match, token: string) => `Bearer ${maskSecret(token)}`);
}

/** Deep-scrub any JSON-compatible value. */
export function scrubValue<T>(value: T, secrets: readonly string[]): T {
  return JSON.parse(scrubText(JSON.stringify(value), secrets)) as T;
}

export function containsSecret(payload: unknown, secrets: readonly string[]): boolean {
  const text = typeof payload === "string" ? payload : JSON.stringify(payload);
  return secrets.some((secret) => secret.length > 0 && text.includes(secret));
}

/** Throws before anything with a credential in it is sent toward a model. */
export function assertNoSecrets(payload: unknown, secrets: readonly string[]): void {
  if (containsSecret(payload, secrets)) throw new Error("Refusing to send a payload that contains a credential.");
}
