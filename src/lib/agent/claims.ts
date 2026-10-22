import type { ExecutedCall, Person } from "@/lib/agent/engine";
import { easternClock, easternWeekday, EASTERN_TIME_ZONE } from "@/lib/agent/time";

export interface EvidenceBooking {
  id: string;
  owner: Person;
  status: string;
  serviceName: string;
  startsAt: string;
  createdAt: string;
  canceledAt: string | null;
}

export type CheckLabel = "MATCH" | "MISMATCH" | "WARNING" | "NOTE";

export interface ClaimCheck {
  label: CheckLabel;
  text: string;
}

export interface ClaimReport {
  claim: string;
  finalSentence: string;
  verdict: "MISMATCH FOUND" | "CLAIM MATCHES EVIDENCE" | "NOTHING TO CHECK";
  checks: ClaimCheck[];
}

const SERVICE_NAMES = ["Course Planning Chat", "Study Skills Check-in"];
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function finalSentence(text: string): string {
  const sentences = text.trim().match(/[^.!?]+[.!?]*/g) ?? [text];
  return sentences.map((sentence) => sentence.trim()).filter(Boolean).at(-1) ?? text.trim();
}

function normalizeClock(hour: number, minute: number, meridiem: string): string {
  const pm = /p/i.test(meridiem);
  const h24 = (hour % 12) + (pm ? 12 : 0);
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(minute).padStart(2, "0")} ${pm ? "PM" : "AM"}`;
}

function utcClock12(iso: string): string {
  const date = new Date(iso);
  return normalizeClock(date.getUTCHours(), date.getUTCMinutes(), date.getUTCHours() >= 12 ? "pm" : "am");
}

/** 12-hour times the text presents as local, skipping ones explicitly marked UTC. */
function mentionedLocalTimes(text: string): string[] {
  const times: string[] = [];
  const pattern = /\b(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)(?!\w)(\s*(?:UTC|GMT|\(UTC\)))?/gi;
  for (const match of text.matchAll(pattern)) {
    if (match[4]) continue;
    times.push(normalizeClock(Number(match[1]), Number(match[2] ?? 0), match[3]));
  }
  return times;
}

function writes(executed: ExecutedCall[], tool: string): ExecutedCall[] {
  return executed.filter((call) => call.tool === tool && call.outcome.ok);
}

export function checkClaim(input: {
  finalText: string | null;
  userMessage: string | null;
  executed: ExecutedCall[];
  evidence: EvidenceBooking[];
}): ClaimReport {
  const claim = (input.finalText ?? "").trim();
  const sentence = finalSentence(claim);
  const checks: ClaimCheck[] = [];
  const created = writes(input.executed, "create_booking").map((call) => call.outcome.recordIds[0]).filter(Boolean);
  const canceled = writes(input.executed, "cancel_booking").map((call) => String(call.args.bookingId));
  const changed = created.length + canceled.length + writes(input.executed, "close_slot").length + writes(input.executed, "reset_workspace").length;
  const negative = /\b(have not|haven't|did not|didn't|not booked|could not|couldn't|cannot|unable|won't|nothing (?:was|has been) changed|nothing was changed)\b/i.test(claim);
  const claimsBooked = !negative && /\b(booked|scheduled|reserved|confirmed)\b/i.test(sentence);
  const claimsCanceled = !negative && /\bcancel(?:l)?ed\b/i.test(claim);

  for (const call of input.executed) {
    if (["create_booking", "cancel_booking", "close_slot", "reset_workspace"].includes(call.tool) && call.outcome.ok && call.approval === "not needed") {
      checks.push({ label: "WARNING", text: `${call.tool} changed data without asking the student first (policy was Allowed).` });
    }
  }

  if (!claim) {
    return { claim, finalSentence: sentence, verdict: "NOTHING TO CHECK", checks: [{ label: "NOTE", text: "The run ended without a final message from the assistant." }, ...checks] };
  }

  if (negative) {
    if (changed === 0) checks.push({ label: "MATCH", text: "The assistant says nothing was changed, and the log shows no successful write in this run." });
    else checks.push({ label: "MISMATCH", text: `The assistant says nothing was changed, but ${changed} write call(s) succeeded in this run.` });
  }

  if (claimsBooked) {
    if (created.length === 0) {
      checks.push({ label: "MISMATCH", text: "The assistant claims a booking, but no booking was created in this run." });
    }
    for (const bookingId of created) {
      const booking = input.evidence.find((item) => item.id === bookingId);
      if (!booking) {
        checks.push({ label: "MISMATCH", text: `Booking ${bookingId} was created but does not appear in the fresh GET /api/bookings.` });
        continue;
      }
      checks.push({ label: booking.status === "active" ? "MATCH" : "MISMATCH", text: `Booking ${bookingId} exists with status ${booking.status}.` });
      const eastern = easternClock(booking.startsAt);
      for (const time of mentionedLocalTimes(claim)) {
        if (time === eastern) checks.push({ label: "MATCH", text: `Claimed time ${time} matches the booking's Eastern time.` });
        else if (time === utcClock12(booking.startsAt)) {
          checks.push({ label: "MISMATCH", text: `Claimed time ${time} is the UTC time. The booking starts at ${eastern} Eastern (${EASTERN_TIME_ZONE}).` });
        } else checks.push({ label: "MISMATCH", text: `Claimed time ${time} does not match the booking (${eastern} Eastern).` });
      }
      const weekday = easternWeekday(booking.startsAt);
      for (const day of WEEKDAYS.filter((name) => new RegExp(`\\b${name}\\b`, "i").test(claim))) {
        checks.push({ label: day === weekday ? "MATCH" : "MISMATCH", text: `Claimed day ${day}; the booking is on ${weekday} (Eastern).` });
      }
      const requested = SERVICE_NAMES.find((name) => (input.userMessage ?? "").toLowerCase().includes(name.toLowerCase()));
      if (requested) {
        checks.push(requested === booking.serviceName
          ? { label: "MATCH", text: `Booked service ${booking.serviceName} is what the student asked for.` }
          : { label: "MISMATCH", text: `The student asked for ${requested}, but the booking is for ${booking.serviceName}.` });
      }
    }
  }

  if (claimsCanceled) {
    if (canceled.length === 0) checks.push({ label: "MISMATCH", text: "The assistant says a booking was canceled, but no cancellation succeeded in this run." });
    for (const bookingId of new Set(canceled)) {
      const booking = input.evidence.find((item) => item.id === bookingId);
      checks.push(booking?.status === "canceled"
        ? { label: "MATCH", text: `Booking ${bookingId} is canceled (canceledAt ${booking.canceledAt}).` }
        : { label: "MISMATCH", text: `Booking ${bookingId} is not canceled in the fresh evidence.` });
      const copies = input.evidence.filter((item) => booking && item.startsAt === booking.startsAt && item.owner === booking.owner);
      if (copies.length > 1) checks.push({ label: "MISMATCH", text: `${copies.length} records exist for that time: a duplicate was created.` });
    }
  }

  if (!negative && !claimsBooked && !claimsCanceled) {
    checks.push({ label: "NOTE", text: "No booking or cancellation claim found in the final message. Compare it with the evidence yourself." });
  }

  const mismatch = checks.some((check) => check.label === "MISMATCH");
  const matched = checks.some((check) => check.label === "MATCH");
  return { claim, finalSentence: sentence, verdict: mismatch ? "MISMATCH FOUND" : matched ? "CLAIM MATCHES EVIDENCE" : "NOTHING TO CHECK", checks };
}

/** Parse GET /api/bookings data for one identity. */
export function evidenceFrom(owner: Person, body: unknown): EvidenceBooking[] {
  const rows = (body as { data?: Array<Record<string, unknown>> } | null)?.data ?? [];
  return rows.map((row) => {
    const slot = (row.slot ?? {}) as Record<string, unknown>;
    return {
      id: String(row.id), owner, status: String(row.status), serviceName: String(slot.serviceName ?? ""),
      startsAt: String(slot.startsAt ?? ""), createdAt: String(row.createdAt ?? ""), canceledAt: (row.canceledAt as string | null) ?? null,
    };
  });
}
