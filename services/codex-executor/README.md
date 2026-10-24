# Codex Executor

The planned asynchronous execution service for running Codex headless jobs on behalf of OpenCode.

Phase 1 defines the service contract only. It does not start Codex processes or expose an HTTP server yet.

## Contract

The contract in [`src/contract.ts`](./src/contract.ts) defines:

- idempotent execution submission;
- queued, running, and terminal execution states;
- stdout/stderr log records with sequence numbers;
- final agent messages;
- independent verification results;
- completion, failure, and cancellation events;
- status helpers that distinguish process completion from verified success.

The intended service API is:

```text
POST /executions
GET  /executions/:jobID
GET  /executions/:jobID/events?after=<sequence>
POST /executions/:jobID/cancel
```

The implementation should use durable storage and isolate each Codex invocation in its own workspace or container.
