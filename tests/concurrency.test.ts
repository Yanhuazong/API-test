import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { installFixtureHooks, lab, callApi, pool, resetWorkspace } from "./fixture";

describe("serialized write concurrency", () => {
  installFixtureHooks();
  beforeEach(async () => resetWorkspace());

  it("accepts exactly one of two concurrent bookings for the same slot", async () => {
    const requests = await Promise.all([
      callApi(lab, "/api/bookings", "studentA", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slotId: lab.manifest.availableSlotId }),
      }),
      callApi(lab, "/api/bookings", "studentB", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slotId: lab.manifest.availableSlotId }),
      }),
    ]);
    assert.deepEqual(requests.map((response) => response.status).sort(), [201, 409]);
    const active = await pool.query<{ count: string }>(
      "SELECT count(*) FROM bookings WHERE workspace_id = $1 AND slot_id = $2 AND status = 'active'",
      [lab.id, lab.manifest.availableSlotId],
    );
    assert.equal(active.rows[0].count, "1");
  });

  it("prevents booking and slot closure from producing an active booking on a closed slot", async () => {
    const [booking, closure] = await Promise.all([
      callApi(lab, "/api/bookings", "studentB", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slotId: lab.manifest.availableSlotId }),
      }),
      callApi(lab, `/api/slots/${lab.manifest.availableSlotId}`, "advisor", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "closed" }),
      }),
    ]);
    assert.equal([[201, 409], [409, 200]].some(([bookingStatus, closureStatus]) =>
      booking.status === bookingStatus && closure.status === closureStatus), true);
    const state = await pool.query<{ status: string; active: string }>(
      `SELECT s.status, count(b.id) FILTER (WHERE b.status = 'active')::text AS active
       FROM slots s LEFT JOIN bookings b
       ON b.workspace_id = s.workspace_id AND b.slot_id = s.id
       WHERE s.workspace_id = $1 AND s.id = $2 GROUP BY s.id`,
      [lab.id, lab.manifest.availableSlotId],
    );
    const { status, active } = state.rows[0];
    if (status === "closed") assert.equal(active, "0");
    if (status === "open") assert.equal(active, "1");
  });
});
