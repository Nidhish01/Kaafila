# Dispatch API v1

Base: the deployed `dispatch` HTTPS function followed by `/v1`. JSON requests use `Content-Type: application/json`.

Driver authentication: `Authorization: Bearer <Firebase ID token>`. Tokens must originate from phone authentication and match an active enrolled phone. Token revocation/expiry is checked. Ownership is verified on every job, proof, event and location endpoint.

Manager authentication is only performed by the private website's server gateway. It uses the server-only gateway secret plus the authenticated platform manager ID. This is not an Android or browser credential.

| Method | Path | Caller / purpose |
|---|---|---|
| GET | `/me` | Driver profile and active enrollment |
| GET | `/jobs` | Own assignments/history; managers see the pilot organisation |
| GET | `/jobs/:id` | Owned job |
| POST | `/jobs/:id/actions` | Driver workflow or manager intervention |
| POST | `/jobs/:id/proofs/:photoId?stopId=:stopId` | Driver JPEG/PNG binary upload, max 8 MB |
| GET | `/jobs/:id/proofs/:photoId` | Private image stream; owner driver or organisation manager |
| POST | `/jobs/:id/locations` | Up to 100 captured GPS positions |
| POST | `/jobs/:id/tracking` | Driver sharing / paused / stopped presence |
| POST | `/jobs/:id/incidents` | Driver incident, with unique event ID |
| POST | `/device-token` | Register or remove the current driver's FCM token |
| GET | `/dashboard` | Manager drivers, vehicles, jobs, incidents |
| POST | `/drivers` | Manager enrollment by E.164 phone |
| POST | `/drivers/:id/status` | Manager activation/revocation; active job must first be reconciled |
| POST | `/vehicles` | Manager vehicle registration |
| POST | `/jobs` | Manager assignment with unique job and creation event IDs |
| GET | `/jobs/:id/events` | Manager append-only audit history |
| POST | `/incidents/:id` | Manager resolution |

Job action example:

```json
{"eventId":"device-generated-uuid","expectedVersion":4,"type":"deliver","stopId":"stop-1","quantities":{"milk":30,"bread":12},"receiver":"Receiver name","photoId":"uploaded-photo-uuid","outcome":"delivered","reason":"Ten cartons damaged"}
```

Driver actions: `accept`, `decline`, `start`, `pickup`, `deliver`, `complete`. Manager actions: `cancel`, `reassign`, `resolve`. Starting requires `sharing:true`. Declining, cancellation, reassignment, failed deliveries, shortages, damage and resolution require a reason. Failed deliveries must have zero actual delivered quantity. All stop proofs require a photo and a receiver entry (use a localized “No receiver” on failure).

`expectedVersion` is an exact optimistic concurrency check. Each accepted action increments the version inside a Firestore transaction. A per-driver `activeJobId` lock permits one accepted/in-progress job. The event ID and canonical payload fingerprint are stored in the same transaction. Repeating identical action data returns its original result. Reusing an event ID with different data returns `EVENT_CONFLICT`. Photo IDs are immutable, content-hashed and bound to the driver and stop. One proof can be consumed once.

Delivery quantities are non-negative whole units. A delivery cannot exceed its stop allocation or remaining loaded stock. Stops must be completed in order. Pickup mismatch, delivery shortage/damage and undelivered loaded stock remain in `reviewReasons`. Completion with unresolved discrepancies enters `review_required` and stops tracking. Resolution preserves the original reasons in the audit trail.

Location batches use their own event IDs and do not increment job versions. Capture time and accuracy are retained; an older batch cannot replace a newer latest position. Tracking presence and token registration are idempotent updates rather than stock transitions. Registration uses unique IDs/phone uniqueness. Incident resolution cannot append a duplicate resolution.

Errors use `{error,code}` with HTTP 400 validation, 401 expired/invalid session, 403 enrollment/ownership, 404 missing/expired evidence, 409 version/state/event/custody conflict, 413 oversized photo, or 500 service unavailable. Retries preserve the event ID and payload.

## Offline semantics

SQLite stores cached jobs, a durable ordered outbox, and photo file references. Action previews increment local versions so the original chain can be retried in order. Network failures stay `saved`; in-flight items are `syncing`; removing the event after an acknowledged response establishes server confirmation. Restart resets interrupted `syncing` items to `saved`. Photos are uploaded before their delivery event. They are removed from device storage after confirmation.

A validation, cancellation, ownership or version conflict holds that job's remaining queue for review. It never rewrites expected versions to force stale work through. The driver can explicitly discard the whole dependent chain and load current server state; photos and unsent work are removed only after that choice. Signing out explains that unsent work is removed and stops tracking.

## Pilot bounds

This is a single-organisation pilot per Firebase deployment. Dashboard/assignment reads are bounded to 500 records and event history to 1,000 entries per job. Add pagination/archive policies before exceeding that scale. There is no route optimisation, ERP write-back, custom navigation engine, Play Store release, or production SMS activation in the current configured-later build.
