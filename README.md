# Fault-Tolerant Data Processing System

Run locally:

```bash
npm start
```

Open `http://localhost:3000`.

## What assumptions did you make?

- This is a single-process prototype, so the datastore is a JSON file at `data/events.json`. The code models the storage boundary with atomic file replacement and a write queue; in production this would be a database transaction with a unique idempotency key.
- Clients do not provide reliable event IDs. I therefore dedupe by a deterministic fingerprint of the canonical event: `client_id`, `metric`, normalized numeric `amount`, and normalized `timestamp`.
- Exact semantic duplicates should not be counted twice. Different events that normalize to the same canonical fields will be treated as duplicates, which is conservative for counting but can undercount if clients emit two legitimate identical events.
- Normalization is configurable through alias lists in `server.js`. New client formats should usually be handled by adding aliases or versioned mapping rules, not by scattering client-specific conditionals through ingestion.
- Extra fields are accepted and recorded as ignored normalization notes. Missing or malformed required canonical fields are rejected without crashing ingestion.

## How does your system prevent double counting?

Every accepted event gets a canonical fingerprint. During ingestion, the write queue reads the current store, checks whether that fingerprint already exists in `processed_events`, and only appends a processed record if it is new.

Retries with the same data return a `duplicate` response and create only a raw duplicate receipt record. Aggregates are computed from `processed_events`, so duplicate receipts do not affect totals or counts.

## What happens if the database fails mid-request?

The UI's "simulate database failure" option returns a retryable `503` before committing anything. Since no processed event or aggregate counter is updated, a client retry can safely submit the same event again.

The prototype avoids separate "write event then update counter" state because that creates an inconsistency window. The durable state transition is raw accepted event plus processed canonical event in one atomic store write. In a real database this would be one transaction with a uniqueness constraint on the canonical fingerprint.

## What would break first at scale?

- The JSON file store and in-process write queue would become the first bottleneck. They serialize all writes and cannot coordinate across multiple server instances.
- Fingerprint-based dedupe without a client event ID can undercount legitimate identical events. At higher volume, clients should be required to send stable idempotency keys or the system should issue ingestion tokens.
- Aggregates are calculated on read from processed events. That is consistent and simple, but slow for large history. I would add materialized aggregate tables updated transactionally or rebuilt by a background job.
- Normalization rules are currently code config. As formats evolve, they should become versioned schema/mapping records so old raw events remain reprocessable and queryable under the rules that applied when they arrived.
