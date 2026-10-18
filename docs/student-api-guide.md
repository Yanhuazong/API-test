# Student API guide

## Credentials and base URL

Your instructor assigns one workspace. Run the API at `http://localhost:3000`
or use the instructor's deployment URL. In Postman, set `baseUrl`, `labKey`,
and the three identity tokens from your assigned private workspace handout.
Keep secrets in your local Postman environment; do not export or share an
environment containing credentials.

Every request other than `GET /api/health` sends `X-Lab-Key: {{labKey}}`.
Token-authenticated requests also send
`Authorization: Bearer {{studentAToken}}` (or the relevant identity token).
Set identity explicitly on each request. The lab key is a classroom isolation
mechanism, not user authentication.

“Public” below means available without a user token **inside your assigned
workspace**. Invalid tokens are rejected even on these public reads.

## Conceptual model

- A **workspace** contains two students, one advisor, their services, times,
  and bookings.
- A **service** describes an advising interaction. Draft services are private.
- A **slot** belongs to one service and advisor. Availability is derived from
  an open status and the absence of an active booking.
- A **booking** links one student to one slot. Cancellation preserves history
  and releases the slot.

Each record has a UUID. Database relationships and requests are restricted to
the workspace selected by the lab key.

## Endpoint reference

| Method | Path | Input | Access | Outcomes |
|---|---|---|---|---|
| GET | `/api/health` | none | Public | 200 health response |
| GET | `/api/services` | none | Workspace key | 200 published services only |
| GET | `/api/services/:id` | UUID path | Workspace key | 200 published service; otherwise 404 |
| GET | `/api/slots` | `date`, `serviceId`, `available`, `limit`, `offset` | Workspace key | 200 paginated published-service slots |
| GET | `/api/slots/:id` | UUID path | Workspace key | 200 public slot fields; otherwise 404 |
| GET | `/api/me` | none | Workspace key + token | 200 current fictional identity |
| GET | `/api/bookings` | optional `status`, `limit`, `offset` | Workspace key + token | 200 own student or assigned advisor bookings |
| POST | `/api/bookings` | `{ "slotId": "UUID" }` | Student token | 201 booking; 400/401/403/404/409/415 |
| GET | `/api/bookings/:id` | UUID path | Owner or assigned advisor | 200; another student gets 403; other workspace gets 404 |
| PATCH | `/api/bookings/:id` | `{ "status": "canceled" }` | Owner or assigned advisor | 200; canceled history retained |
| PATCH | `/api/slots/:id` | `{ "status": "open" }`, `{ "status": "closed" }`, and/or `{ "room": "..." }` | Assigned advisor | 200; active-booking closure is 409 |
| POST | `/api/lab/reset` | no body | Any valid identity in workspace | 200 restore manifest; workspace-scoped |

List routes use:

```json
{
  "data": [{ "id": "..." }],
  "pagination": { "limit": 2, "offset": 0, "nextOffset": 2, "hasMore": true }
}
```

Single-resource and successful write responses use `{ "data": ... }`. Every
error uses `{ "error": { "code": "...", "message": "...", "fields": {} },
"requestId": "..." }`; `fields` is present for validation details.

## Examples

List services:

```http
GET /api/services
X-Lab-Key: <your workspace key>
```

Create a booking. Set the identity token to Student B for this request:

```http
POST /api/bookings
X-Lab-Key: <your workspace key>
Authorization: Bearer <Student B token>
Content-Type: application/json

{ "slotId": "<availableSlotId from your handout>" }
```

Successful creation returns 201, a `Location: /api/bookings/<id>` header, and
the new record. `studentId` comes from the token; it cannot be supplied in the
request. Cancellation is `PATCH /api/bookings/<id>` with
`{ "status": "canceled" }`. Repeating cancellation returns the original
`canceledAt` without creating or deleting records.

## Types, validation, and business rules

JSON has typed values: strings (`"hello"`), numbers (`2`), booleans (`true`),
arrays (`["a", "b"]`), objects (`{"a": 1}`), and `null`. Quotes matter:
`"true"` is a string, not a boolean.

The server checks three different things:

1. **JSON syntax** — malformed JSON is `400 MALFORMED_JSON`.
2. **Schema validation** — wrong field types, extra fields, and invalid IDs
   are `400 VALIDATION_ERROR`.
3. **Business rules** — a closed, past, or occupied slot cannot be booked;
   conflicts use 409. A valid shape does not guarantee a valid action.

Write endpoints require `Content-Type: application/json` (415 otherwise).
Unknown write fields are rejected. The database enforces at most one active
booking per slot; cancellation retains the old row and releases that slot.

## Public and private data

Public service and slot responses do not contain email addresses, slot
`internalNote`, booking owner details, or booking `privateNote`. Student booking
detail responses omit `privateNote` entirely. Only the advisor assigned to the
slot receives that field. Hiding a field in a user interface would not protect
it; the API must not send it.

## Filtering and dates

`GET /api/slots` defaults to 5 rows and accepts a maximum `limit` of 20.
`offset` starts at 0. Slots sort by `startsAt`, then UUID. `available=true`
means status is open and no active booking exists; `available=false` includes
closed or occupied slots. Without a date filter, unavailable slots are still
listed. `date=YYYY-MM-DD` uses the slot's **UTC calendar date**, not your local
calendar date.

## Status codes

| Code | Meaning |
|---|---|
| 200 | Read or update succeeded |
| 201 | Booking created |
| 400 | Malformed JSON, invalid query, or schema validation |
| 401 | Missing/invalid workspace key or required/valid user token |
| 403 | Existing in-workspace record, insufficient permission |
| 404 | Missing or outside-workspace record |
| 409 | Booking or state conflict |
| 415 | Body endpoint needs `application/json` |
| 405 | Unsupported method |
| 500 | Unexpected internal failure; use requestId when reporting it |

Responses are not cached. Never send credentials in screenshots or shared
exports.

## Reset and troubleshooting

`POST /api/lab/reset` restores only the workspace identified by your key. It
resets seed records but keeps the workspace key, tokens, IDs, and saved dates.
Any fictional identity can reset its workspace as a classroom convenience;
this is not a production authorization pattern.

- 401: check the assigned workspace key and explicitly selected token.
- 403: authentication succeeded but that identity is not allowed to access
  the record.
- 404: check the UUID and workspace; other workspaces are intentionally hidden.
- 409 `SLOT_UNAVAILABLE`: another active booking occupies the slot.
- 409 `SLOT_NOT_BOOKABLE`: the slot is closed or has started.
- 400: inspect `error.fields`; extra request properties are not accepted.
- Unexpected 500: share the `requestId` with your instructor, never a secret.
