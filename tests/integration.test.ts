import assert from "node:assert/strict";
import { beforeEach, describe, it, test } from "node:test";
import { installFixtureHooks, lab, otherLab, rateLab, callApi, pool, resetWorkspace } from "./fixture";

describe("teaching API integration", () => {
  installFixtureHooks();
  beforeEach(async () => resetWorkspace());

  it("returns only published services and hides draft service slots", async () => {
    const list = await callApi(lab, "/api/services");
    assert.equal(list.status, 200);
    const services = (await list.json()).data;
    assert.equal(services.length, 2);
    assert.equal(services.map((service: { id: string }) => service.id).includes(lab.manifest.draftServiceId), false);
    assert.equal(JSON.stringify(services).includes("email"), false);

    const draft = await callApi(lab, `/api/services/${lab.manifest.draftServiceId}`);
    assert.equal(draft.status, 404);
    assert.equal((await draft.json()).error.code, "SERVICE_NOT_FOUND");
    const draftSlot = await callApi(lab, `/api/slots/${lab.manifest.draftSlotId}`);
    assert.equal(draftSlot.status, 404);
  });

  it("publishes only safe slot fields and provides UTC filtering and pagination", async () => {
    const response = await callApi(lab, `/api/slots?date=${lab.manifest.testDate}&limit=2`);
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.data.length, 2);
    assert.deepEqual(body.pagination, { limit: 2, offset: 0, nextOffset: 2, hasMore: true });
    assert.equal("internalNote" in body.data[0], false);
    assert.equal("email" in body.data[0], false);
    assert.equal("studentId" in body.data[0], false);

    const invalid = await callApi(lab, "/api/slots?date=2026-02-30");
    assert.equal(invalid.status, 400);
    assert.equal((await invalid.json()).error.code, "INVALID_QUERY");
    const unknown = await callApi(lab, "/api/slots?unknown=1");
    assert.equal(unknown.status, 400);
  });

  it("distinguishes missing, invalid, and mismatched teaching credentials", async () => {
    const missing = await callApi(lab, "/api/me");
    assert.equal(missing.status, 401);
    assert.equal((await missing.json()).error.code, "USER_TOKEN_REQUIRED");

    const invalid = await callApi(lab, "/api/services", undefined, {
      headers: { Authorization: "Bearer invalid-invalid-invalid-invalid-token" },
    });
    assert.equal(invalid.status, 401);
    assert.equal((await invalid.json()).error.code, "INVALID_USER_TOKEN");

    const mismatch = await callApi(lab, "/api/me", "studentA", {
      headers: { "X-API-Key": otherLab.key },
    });
    assert.equal(mismatch.status, 401);
  });

  it("persists successful bookings and rejects invalid and impersonated writes", async () => {
    const created = await callApi(lab, "/api/bookings", "studentB", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slotId: lab.manifest.availableSlotId }),
    });
    assert.equal(created.status, 201);
    const createdBody = await created.json();
    assert.equal(created.headers.get("location"), `/api/bookings/${createdBody.data.id}`);
    assert.equal(createdBody.data.studentId, lab.manifest.studentBUserId);

    const persisted = await callApi(lab, `/api/bookings/${createdBody.data.id}`, "studentB");
    assert.equal(persisted.status, 200);
    assert.equal((await persisted.json()).data.status, "active");
    const inDb = await pool.query("SELECT id FROM bookings WHERE workspace_id = $1 AND id = $2", [lab.id, createdBody.data.id]);
    assert.equal(inDb.rowCount, 1);

    const countBefore = await pool.query<{ count: string }>("SELECT count(*) FROM bookings WHERE workspace_id = $1", [lab.id]);
    for (const body of [
      "{",
      JSON.stringify({ slotId: 42 }),
      JSON.stringify({ slotId: lab.manifest.availableSlotId, studentId: lab.manifest.studentAUserId }),
    ]) {
      const response = await callApi(lab, "/api/bookings", "studentB", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      });
      assert.equal(response.status, 400);
    }
    const wrongType = await callApi(lab, "/api/bookings", "studentB", {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify({ slotId: lab.manifest.availableSlotId }),
    });
    assert.equal(wrongType.status, 415);
    const countAfter = await pool.query<{ count: string }>("SELECT count(*) FROM bookings WHERE workspace_id = $1", [lab.id]);
    assert.equal(countAfter.rows[0].count, countBefore.rows[0].count);
  });

  it("enforces ownership, workspace isolation, and advisor-only fields", async () => {
    const studentA = await callApi(lab, `/api/bookings/${lab.manifest.studentABookingId}`, "studentA");
    const studentData = (await studentA.json()).data;
    assert.equal(studentA.status, 200);
    assert.equal("privateNote" in studentData, false);

    const forbidden = await callApi(lab, `/api/bookings/${lab.manifest.studentABookingId}`, "studentB");
    assert.equal(forbidden.status, 403);
    assert.equal((await forbidden.json()).error.code, "BOOKING_FORBIDDEN");

    const advisor = await callApi(lab, `/api/bookings/${lab.manifest.studentABookingId}`, "advisor");
    assert.equal((await advisor.json()).data.privateNote, "Private sample note for the assigned advisor.");

    const outside = await callApi(lab, `/api/bookings/${otherLab.manifest.studentABookingId}`, "studentA");
    assert.equal(outside.status, 404);
  });

  it("rejects occupied booking and preserves canceled history while releasing availability", async () => {
    const conflict = await callApi(lab, "/api/bookings", "studentB", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slotId: lab.manifest.occupiedSlotId }),
    });
    assert.equal(conflict.status, 409);
    assert.equal((await conflict.json()).error.code, "SLOT_UNAVAILABLE");

    const created = await callApi(lab, "/api/bookings", "studentB", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slotId: lab.manifest.availableSlotId }),
    });
    const bookingId = (await created.json()).data.id as string;
    const canceled = await callApi(lab, `/api/bookings/${bookingId}`, "studentB", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "canceled" }),
    });
    const canceledAt = (await canceled.json()).data.canceledAt as string;
    const repeated = await callApi(lab, `/api/bookings/${bookingId}`, "studentB", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "canceled" }),
    });
    assert.equal((await repeated.json()).data.canceledAt, canceledAt);
    const slot = await callApi(lab, `/api/slots/${lab.manifest.availableSlotId}`);
    assert.equal((await slot.json()).data.available, true);
    const history = await pool.query("SELECT id FROM bookings WHERE workspace_id = $1 AND id = $2 AND status = 'canceled'", [lab.id, bookingId]);
    assert.equal(history.rowCount, 1);

    const replacement = await callApi(lab, "/api/bookings", "studentB", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slotId: lab.manifest.availableSlotId }),
    });
    assert.equal(replacement.status, 201);
  });

  it("serializes reset within its workspace and leaves other workspaces untouched", async () => {
    const secondBefore = await pool.query<{ count: string }>(
      "SELECT count(*) FROM bookings WHERE workspace_id = $1 AND status = 'active'", [otherLab.id],
    );
    const created = await callApi(lab, "/api/bookings", "studentB", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slotId: lab.manifest.availableSlotId }),
    });
    assert.equal(created.status, 201);
    const response = await callApi(lab, "/api/reset", "studentA", { method: "POST" });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).data.testDate, lab.manifest.testDate);
    const first = await pool.query<{ count: string }>(
      "SELECT count(*) FROM bookings WHERE workspace_id = $1", [lab.id],
    );
    const secondAfter = await pool.query<{ count: string }>(
      "SELECT count(*) FROM bookings WHERE workspace_id = $1 AND status = 'active'", [otherLab.id],
    );
    assert.equal(first.rows[0].count, "2");
    assert.equal(secondAfter.rows[0].count, secondBefore.rows[0].count);
  });
});

test("rate limiting returns 429 with Retry-After, and reset is exempt", async () => {
  const first = await callApi(rateLab, "/api/services");
  const limit = Number(first.headers.get("X-RateLimit-Limit"));
  assert.equal(first.status, 200);
  assert.equal(Number(first.headers.get("X-RateLimit-Remaining")), limit - 1);
  let limited: Response | undefined;
  for (let i = 1; i <= limit && !limited; i += 1) {
    const response = await callApi(rateLab, "/api/services");
    if (response.status === 429) limited = response;
  }
  assert.ok(limited, "expected a 429 response");
  assert.equal((await limited.json()).error.code, "RATE_LIMITED");
  assert.ok(Number(limited.headers.get("Retry-After")) >= 1);
  assert.equal(limited.headers.get("X-RateLimit-Remaining"), "0");
  assert.equal((await callApi(rateLab, "/api/reset", "studentA", { method: "POST" })).status, 200);
});
