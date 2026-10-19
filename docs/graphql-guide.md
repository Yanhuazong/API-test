# GraphQL guide

The campus advising data is also available through **GraphQL** at one URL:

```
POST /api/graphql
X-API-Key: <your apiKey>
Authorization: Bearer <a user token>
Content-Type: application/json

{ "query": "{ services { name description } }" }
```

Try it in the browser at `/graphql`, or in Postman as a normal POST request with
a JSON body. It uses the same API key and user tokens as the REST API, the same
workspace, and the same rules. It also shares the same rate limit: each HTTP
request counts once, however many things the query asks for.

## REST vs GraphQL

| | REST | GraphQL |
|---|---|---|
| URLs | One per resource (`/api/slots`, `/api/bookings`) | One (`/api/graphql`) |
| Fields returned | Fixed by the server | Chosen by your query |
| Related data | Extra requests | Nested in one request |
| Changing data | POST, PATCH, DELETE | A `mutation` (still sent with POST) |
| Errors | HTTP status codes | HTTP status **and** an `errors` list; some failures still return 200 |

## What you can ask for

Queries (reading):

- `me` — the signed-in person
- `services`, `service(id)` — published services
- `slots(serviceId, date, available, limit, offset)` — appointment times; each slot has a nested `service`
- `myBookings(status, limit, offset)` — students see their own; advisors see bookings for their slots; each booking has a nested `slot`

Mutation (changing):

- `bookSlot(slotId)` — students only

Lists default to 5 items and allow at most 20.

## Things to investigate

1. Run `{ services { name } }`, then add `description`. What changes in the response? What does REST return for `GET /api/services`?
2. Ask for slots with their service's name in one request. How many REST calls would that take?
3. Run the same `myBookings` query as Avery, Bailey and Casey. Who sees what?
4. Run `bookSlot` twice for the same slot. Which error code do you get? Compare with `POST /api/bookings`.
5. Ask for a field that does not exist, such as `price`. What is the HTTP status? Where is the error?
6. Ask `bookSlot` as Casey (advisor). Is the status 200 or 403? Where does the error appear?
7. Send the request with a wrong API key. How is that error different from a bad field?
8. Use variables (`$slotId`) instead of writing the value into the query. Why might that be better?

## Introspection

GraphQL describes itself. Send `{ __schema { types { name } } }` to list every type,
or `{ __type(name: "Slot") { fields { name } } }` to see the fields on `Slot`.

## Errors

- Missing or wrong API key or token: HTTP 401 with an `errors` list.
- Query that cannot be parsed or fails validation (unknown field): HTTP 400, no `data`.
- Problem inside one field (not allowed, slot taken): HTTP 200, with `data` (possibly `null`) **and** `errors`. Always check for `errors`, not just the status.
- `extensions.code` carries the same codes as the REST API (`SLOT_UNAVAILABLE`, `STUDENT_ONLY`).
