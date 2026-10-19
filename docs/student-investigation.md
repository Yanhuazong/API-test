# Guided investigation worksheet

Complete the website and explorer activities (or the
[Postman build-by-hand page](./build-your-first-requests.md)) first. The
`/explorer` page can send every request in this worksheet, so Postman is
optional.

Use your assigned Postman environment (or the explorer). Before each exercise, set the identity
on that request explicitly. Do not leave a shared “current user” variable that
silently changes later requests.

For every exercise, write a short response to all four prompts: **Predict**,
**Send the request**, **Inspect the status and body**, and **Explain the result
using a design concept**. Reset your workspace whenever an exercise says to
start fresh.

## 1. Published data and JSON values

### Public service data versus draft content
- **Predict:** What should an unauthenticated-within-the-workspace reader see?
- **Send:** `GET /api/services`, then `GET /api/services/{{draftServiceId}}`.
- **Inspect:** Compare the 200 service list with the draft lookup's 404.
- **Explain:** Relate publication status to API visibility and information boundaries.

### JSON types: string, boolean, array, and null
- **Predict:** Which JSON values have different types even when they look similar?
- **Send:** `GET /api/slots?limit=2`; inspect `room` and `available`. In a scratch
  JSON object, write a string, `true`, an array, and `null`.
- **Inspect:** Identify each type in the actual response and your example.
- **Explain:** Why are `true` and `"true"` not interchangeable? What does `null`
  say about a room?

## 2. Querying and validation

### Filtering and pagination
- **Predict:** Which slot IDs will appear for `date={{testDate}}&limit=2&offset=0`?
- **Send:** Fetch offsets 0, 2, then filter with `available=true` and
  `available=false`.
- **Inspect:** Compare ordering, overlap, and `pagination`.
- **Explain:** How are filters, sorting, and pagination part of a contract?
  Dates refer to UTC calendar dates.

### Valid JSON with invalid field types
- **Predict:** What status distinguishes valid JSON from a valid schema?
- **Send:** `POST /api/bookings` as Student B with
  `{ "slotId": 42 }`, then with `{ "slotId": "<valid UUID>", "role": "advisor" }`.
- **Inspect:** Expect 400 and stable validation details; no booking is created.
- **Explain:** Distinguish syntax validation from type/unknown-field validation.

### Malformed JSON and wrong media type
- **Predict:** Will malformed JSON and a missing JSON content type have the same error?
- **Send:** Send malformed body `{` with JSON content type, then send a valid body
  as `text/plain`.
- **Inspect:** Expect `400 MALFORMED_JSON`, then `415 UNSUPPORTED_MEDIA_TYPE`.
- **Explain:** The HTTP content type is separate from parsing and schema validation.

## 3. State and source of truth

### Successful creation and persistence
- **Predict:** What fields should the server derive rather than trust?
- **Send:** Reset, then create a booking as Student B using
  `{{availableSlotId}}`. Save the returned ID locally as `createdBookingId`.
- **Inspect:** Expect 201 and a Location header. Fetch it and list Student B's
  bookings; the record persists across requests.
- **Explain:** The database, not a successful-looking response or client array,
  is the source of truth.

### Occupied-slot conflict
- **Predict:** What should happen if Student B attempts `{{occupiedSlotId}}`?
- **Send:** Post a booking to that slot.
- **Inspect:** Expect 409 `SLOT_UNAVAILABLE`; check there is still only Student A's
  active booking.
- **Explain:** A business conflict differs from malformed input.

### Cancellation and derived availability
- **Predict:** Does cancellation delete a booking or change availability?
- **Send:** As Student B, cancel `{{createdBookingId}}`; inspect slot detail and
  the canceled booking.
- **Inspect:** Expect canceled status, a timestamp, retained history, and the
  slot now available.
- **Explain:** Availability is derived from slot status plus active bookings.

### Repeat cancellation
- **Predict:** Will another cancellation create a second record or a new timestamp?
- **Send:** Repeat the same PATCH.
- **Inspect:** Expect 200 and exactly the original `canceledAt`.
- **Explain:** Idempotent state transitions make retries safe.

## 4. Identity and access boundaries

### Authentication versus authorization
- **Predict:** How do no token, an invalid token, and a valid Student B token differ?
- **Send:** Call `GET /api/me` with no token, then an invalid token, then Student B.
- **Inspect:** Expect 401, 401, then 200.
- **Explain:** Authentication identifies a caller; authorization decides what it may do.

### Record ownership
- **Predict:** Can Student B read Student A's existing booking?
- **Send:** As Student B, `GET /api/bookings/{{studentABookingId}}`; then repeat
  as Student A.
- **Inspect:** Expect 403 for B and 200 for A.
- **Explain:** The record exists in the same workspace, so the denial is
  authorization rather than concealment.

### Advisor-only private fields
- **Predict:** Which identity receives `privateNote`?
- **Send:** Read `{{studentABookingId}}` as Student A, then the assigned advisor.
- **Inspect:** Student response omits the property; advisor response includes it.
- **Explain:** Field-level authorization belongs in the API response contract.

### Student cannot impersonate or mutate advisor state
- **Predict:** Can a client choose `studentId` or close a slot as a student?
- **Send:** Attempt creation with `studentId` and attempt PATCH slot as Student B.
- **Inspect:** Expect 400 for the extra create field and 403 for slot update.
- **Explain:** The server derives identity from credentials and applies role checks.

## 5. Concurrency, scope, and reset

### Source of truth and uniqueness
- **Predict:** What prevents two simultaneous requests from both taking one slot?
- **Send:** Your instructor may run the concurrency suite against an isolated
  test database. In the API, send two simultaneous booking requests for the
  same available slot if authorized to do so.
- **Inspect:** Exactly one should create a booking; the other should conflict.
- **Explain:** A database uniqueness constraint is stronger than an application
  “check then insert” alone.

### Reset and workspace isolation
- **Predict:** Which records should reset change?
- **Send:** Create a booking, call `POST /api/reset`, and verify the seed
  manifest and original state. Do not attempt to access another group's IDs.
- **Inspect:** Your workspace returns to its saved seed; credentials and schedule
  remain unchanged.
- **Explain:** Workspace scoping is enforced by the key and every database operation.

## 6. Rate limits

### Hitting the limit
- **Predict:** What happens if you send many requests quickly?
- **Send:** Send `GET /api/services` once and open the response **Headers** tab.
  Then run the request "Rate limit demo" in the Collection Runner with 15 iterations.
- **Inspect:** Watch `X-RateLimit-Remaining` fall to 0, then look for 429
  responses with `RATE_LIMITED` and `Retry-After`. Wait, then send again.
- **Explain:** Why do providers limit usage? How should a well-behaved app
  respond to a 429 (back off and retry instead of looping)?

## Transfer exercise

Choose one interaction in your own prototype. Identify its entities and
relationships, document an endpoint contract (method, path, inputs, access,
success response, and errors), name the source of truth, and propose one
successful test and one rejected test. Explain which validation layer each
test reaches.
