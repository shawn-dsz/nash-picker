# Production readiness

An honest assessment of what would have to change before this ran in a real store.

**Verdict: not production ready, and it should not claim to be.** It is a four-hour build against a sandbox, and it is sound where it was designed to be sound. The gaps below are specific, ranked, and mostly small - which is the useful thing to know.

Findings marked **proven** were reproduced against the running app, not inferred from reading.

---

## What is already sound

Worth stating, because the list below is long and the foundations are not the problem.

| | |
|---|---|
| **Secrets** | Key and org id are server-side only. `lib/nash.ts` imports `server-only`, so a client import is a build error rather than a leak. Verified: no key in any commit |
| **No mock data** | Every path goes through the live API. There are no fixtures to accidentally ship |
| **Tests** | 34 passing, and on the right things - payload mapping, reference dedupe, sequencing. Not coverage theatre |
| **Failure visibility** | Join misses are logged rather than swallowed, because this API returns `200` with an empty result on an identity mismatch |
| **Honest metrics** | `/ops` refuses to display numbers it cannot substantiate, and names the missing field for each |
| **Single source of truth** | No second copy of picking state to reconcile |

---

## Blockers

Would prevent a pilot in a single store.

### B1 - The write endpoint is unauthenticated · **proven**

`POST /api/pick` has no auth, no session, no middleware. There is no `middleware.ts` in the project.

Reproduced with no credentials of any kind:

```
POST /api/pick  { orderId, outcomes: [{ quantity: 99999, ... }] }
→ 200  { written: 1, fillRate: 99999, pickStatus: "items_pick_complete" }
```

Anyone who can reach the app can mark any order picked, at any quantity. On a URL that is currently on the public internet.

**Fix:** authenticate the picker and authorise per store. Half a day with an existing IdP.

### B2 - Outcomes are not validated · **proven**

The route checks that `orderId` exists and `outcomes` is an array. Nothing checks what is *in* the array. `Outcome[]` is a TypeScript annotation, which is erased at runtime.

A quantity of 99999 against a requested quantity of 1 was accepted and written to Nash.

**Fix:** parse the body with a schema, reject `quantity > requestedQuantity`, reject unknown `status`, reject `subItemId` values not on the order. An hour.

### B3 - Fill rate is unclamped, and one bad record poisons the dashboard · **proven**

```ts
return got / ordered;   // lib/outcomes.ts
```

The write above produced `fill_rate: "99999.00"` - a 9,999,900% fill rate - persisted to `orderMetadata` and read back by `/ops`. One malformed record, one UI bug or one double submit corrupts the number the whole commercial argument rests on.

This is the one that is a correctness bug rather than a missing feature. **It does not need an attacker.**

**Fix:** clamp per line before summing. Two lines.

---

## Serious

Would bite within days of real use.

### S1 - Internal errors are returned to the browser · **proven**

```json
{"error":"Nash 404 on /order/ord_x: {\"error\":{\"code\":\"MISSING_RESOURCE\",…},
  \"RequestID\":\"1-6a740be2-71e2d4f43059f6026df1790b\"}"}
```

`NashError.message` carries the upstream path and response body, and the route returns it verbatim. That leaks the vendor's API surface and request ids to any client. **Fix:** log the detail server-side with a correlation id, return the id and a generic message. An hour.

### S2 - No timeout and no retry on any upstream call

`lib/nash.ts` calls `fetch` with no `AbortSignal` and no retry. A hung Nash connection hangs the request until the platform kills it, and one transient 503 fails a pick run that would have succeeded on a second attempt.

**Fix:** `AbortSignal.timeout(...)` plus bounded retry with jitter on idempotent GETs only. Half a day.

### S3 - Two pickers on one order silently overwrite each other

There is no claim, no lock, and no version check. `PATCH` replaces the items array, so the second write wins completely and the first picker's work vanishes with no trace. The 30-second refresh narrows the window; it cannot close it.

**Fix:** a claim step on the order, and an `If-Match`-style version check on write. A day.

### S4 - A completed run can be rewritten

The queue greys out finished orders, but `/api/pick` does not check `pick_status` before writing. The guard is in the UI, which means it is not a guard.

**Fix:** reject a write to an order already at `items_pick_complete` unless an explicit re-pick is requested. An hour.

---

## Known and deliberate

Already documented in `DECISIONS.md` and `TRADEOFFS.md`. Listed so the picture is complete, not because they were missed.

| | | Cost |
|---|---|---|
| Outcomes buffered in memory until the run completes | `T1`, `pick-write.ts` | A crash mid-run loses the run |
| Picking state lives in `metadata`, not a first-class field | `T12` | Nash's own systems cannot act on it |
| No pagination - hard limits of 50 orders, 500 products, 200 inventory | `adapter.ts`, `ops.ts` | **Silently truncates.** A 501st product just has no name |
| Polling on a 30s timer rather than webhooks | `queue-refresh.tsx` | ~83 req/sec across 50 stores, nearly all returning nothing |
| No offline persistence | `SCOPE.md` | Dead spots stop a run |

**Pagination is the one on this list closest to being a real bug.** The limits are silent, and the failure looks like missing data rather than truncation.

---

## Minor

- **No error boundaries.** No `app/error.tsx` or `global-error.tsx`, so an unhandled render error shows the framework's default page
- **No structured logging or correlation id.** One `console.warn` in the whole app. The plan specified a `runId` on every event, log line and response header; it was not built
- **`placehold.co` is in the render path.** Product images come from an external host. If it is blocked or slow, every image on the pick screen breaks at once
- **`tsconfig.tsbuildinfo` is tracked in git.** A build artifact, and it dirties `git status` on every build

---

## If there were one more hour

In this order, because it is the order of consequence:

1. **B3, clamp the fill rate** - two lines, and it protects the only number the commercial case rests on
2. **B2, validate the payload** - an hour, and it makes B3 unreachable rather than merely unlikely
3. **S1, stop leaking upstream errors** - an hour
4. **B1, authenticate** - half a day, so it is a next-sprint item rather than a today item

Everything below that is a known trade-off with a written rationale, which is a different category from a gap.

---

## The honest summary

The **architecture** is production-shaped: one module owns the vendor's payload shape, secrets never reach the browser, there is one source of truth, and the tests cover the logic most likely to be silently wrong.

The **edges** are not. Input validation, authentication, timeouts and concurrency control are all absent, and every one of them is absent because four hours went to proving the domain model rather than hardening the boundary. That was the right call for the exercise and it is the wrong state to ship.

Nothing here needs a redesign. It is roughly **two to three days** of boundary work on top of a sound core.
