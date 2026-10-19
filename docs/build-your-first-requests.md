# Build your first requests by hand

Before using the ready-made collection, build six requests yourself in Postman.
A request is just four things: a **method**, a **URL**, **headers**, and
sometimes a **body**. You will fill each one in and see what comes back.

## Setup (once)

1. In Postman, create a new **Environment** named `API Investigation`.
2. Add these variables, copying values from your private handout:

   | Variable | Value |
   |---|---|
   | `baseUrl` | the URL your instructor gives you (no trailing slash) |
   | `apiKey` | `apiKey` from your handout |
   | `studentAToken` | `tokens.studentA` |
   | `studentBToken` | `tokens.studentB` |
   | `advisorToken` | `tokens.advisor` |
   | `availableSlotId` | `manifest.availableSlotId` |

3. Select that environment (top right). `{{baseUrl}}` in a URL now means the
   value you saved.
4. Create a collection named `My requests` and add each request below to it.

For each request, click **Send**, then note the **status code**, the
**headers** (Headers tab of the response) and the **body**.

## 1. Health check: the simplest request

- Method `GET`, URL `{{baseUrl}}/api/health`. No headers, no body.
- **Question:** Why does this one need no key?

## 2. Missing key: a rejected request

- Method `GET`, URL `{{baseUrl}}/api/services`. No headers.
- **Expect:** 401 with an error code.
- **Question:** Read `error.code` and `error.message`. What would you change?

## 3. Add a header: a successful request

- Same request, but on the **Headers** tab add `X-API-Key` = `{{apiKey}}`.
- **Expect:** 200 and a `data` array of services.
- **Question:** Find `X-RateLimit-Remaining` in the response headers. What
  happens to it each time you click Send?

## 4. Query parameters: ask for less

- Method `GET`, URL `{{baseUrl}}/api/slots`. On the **Params** tab add
  `limit` = `2` and `available` = `true`. Keep the `X-API-Key` header.
- **Expect:** two slots and a `pagination` object.
- **Question:** Change `limit` to `abc`. What status do you get and why?

## 5. Who are you: a token

- Method `GET`, URL `{{baseUrl}}/api/me`. Headers: `X-API-Key` = `{{apiKey}}`
  and `Authorization` = `Bearer {{studentAToken}}`.
- **Expect:** 200 with Student A's name and role.
- **Question:** Swap in `{{advisorToken}}`. What changes? Why is the key not
  enough here?

## 6. Create something: a request with a body

- Method `POST`, URL `{{baseUrl}}/api/bookings`. Headers: `X-API-Key`,
  `Authorization` = `Bearer {{studentBToken}}`, and `Content-Type` =
  `application/json`.
- On the **Body** tab choose **raw** and **JSON**, and enter:

  ```json
  { "slotId": "{{availableSlotId}}" }
  ```

- **Expect:** 201 and the new booking. Send it again: **409**. Remove the
  `Content-Type` header: **415**. Put a typo in the JSON: **400**.
- **Question:** What does each status tell you about what you did wrong?

## Then continue

Once you have built these, you may import the ready-made collection from the
landing page for the remaining exercises in the worksheet, and just click Send.
You now know what is inside every request in it.
