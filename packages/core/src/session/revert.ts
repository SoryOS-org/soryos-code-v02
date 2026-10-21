export * as SessionRevert from "./revert.js"

import { and, asc, eq, gt, sql } from "drizzle-orm"
import { Effect } from "effect"
import { Database } from "../database/database.js"
import { Bus } from "../bus.js"
import { Instance } from "../instance/service.js"
import { RelativePath } from "../schema.js"
import { Snapshot } from "../snapshot.js"
import { SessionEvent } from "./event.js"
import { Money } from "@opencode/schema/money"
import { MessageNotFoundError } from "./error.js"
import { SessionMessage } from "./message.js"
import { SessionSchema } from "./schema.js"
import { SessionHistory } from "./history.js"
import { SessionMessageTable } from "./sql.js"

interface BoundaryInput {
  readonly sessionID: SessionSchema.ID
  readonly messageID: SessionMessage.ID
}

export const stage = Effect.fn("SessionRevert.stage")(function* (input: {
  session: SessionSchema.Info
  messageID: SessionMessage.ID
  files?: boolean
}) {
  const instances = yield* Instance.Service
  const database = yield* Database.Service
  const bus = yield* Bus.Service

  return yield* Effect.gen(function* () {
    const snapshot = yield* Snapshot.Service
    const original = input.session.revert?.snapshot
      ? Snapshot.ID.make(input.session.revert.snapshot)
      : yield* snapshot.capture()
    const next = yield* plan(database.db, { sessionID: input.session.id, messageID: input.messageID })
    const restore = new Map<RelativePath, Snapshot.ID>()
    if (original) {
      for (const file of input.session.revert?.files ?? []) restore.set(RelativePath.make(file.file), original)
    }
    if (input.files !== false) for (const [file, tree] of next) restore.set(file, tree)
    if (restore.size) yield* snapshot.restore({ files: restore })
    const paths = input.files === false ? [] : Array.from(next.keys())
    const files = original
      ? yield* snapshot.diff({ from: original, to: (yield* snapshot.capture()) ?? original, paths })
      : []
    const revert = {
      messageID: input.messageID,
      snapshot: original,
      files,
    } satisfies SessionSchema.Info["revert"]
    yield* bus.publish(SessionEvent.RevertEvent.Staged, {
      sessionID: input.session.id,
      revert,
    })
    return revert
  }).pipe(instances.provide(input.session))
})

export const clear = Effect.fn("SessionRevert.clear")(function* (session: SessionSchema.Info) {
  const instances = yield* Instance.Service
  const bus = yield* Bus.Service
  yield* Effect.gen(function* () {
    const snapshot = yield* Snapshot.Service
    if (!session.revert) return
    const original = session.revert.snapshot ? Snapshot.ID.make(session.revert.snapshot) : undefined
    if (original)
      yield* snapshot.restore({
        files: new Map((session.revert.files ?? []).map((file) => [RelativePath.make(file.file), original])),
      })
    yield* bus.publish(SessionEvent.RevertEvent.Cleared, {
      sessionID: session.id,
    })
  }).pipe(instances.provide(session))
})

export const commit = Effect.fn("SessionRevert.commit")(function* (bus: Bus.Interface, session: SessionSchema.Info) {
  if (!session.revert) return
  const database = yield* Database.Service
  const boundary = yield* database.db
    .select({ seq: SessionMessageTable.seq })
    .from(SessionMessageTable)
    .where(and(eq(SessionMessageTable.session_id, session.id), eq(SessionMessageTable.id, session.revert.messageID)))
    .get()
    .pipe(Effect.orDie)
  // Committing deletes every message row from the boundary onward, which drops their usage from
  // SessionStats. Record it durably first so stats can keep counting the reverted work. The projector
  // leaves the session counters alone for this source: the steps already contributed to them when they
  // ended, so applying it there would double count.
  if (boundary) {
    const usage = yield* database.db
      .get<{
        input: number
        output: number
        reasoning: number
        cacheRead: number
        cacheWrite: number
        cost: number
      }>(
        sql`
        SELECT
          coalesce(sum(json_extract(${SessionMessageTable.data}, '$.tokens.input')), 0) AS input,
          coalesce(sum(json_extract(${SessionMessageTable.data}, '$.tokens.output')), 0) AS output,
          coalesce(sum(json_extract(${SessionMessageTable.data}, '$.tokens.reasoning')), 0) AS reasoning,
          coalesce(sum(json_extract(${SessionMessageTable.data}, '$.tokens.cache.read')), 0) AS cacheRead,
          coalesce(sum(json_extract(${SessionMessageTable.data}, '$.tokens.cache.write')), 0) AS cacheWrite,
          coalesce(sum(json_extract(${SessionMessageTable.data}, '$.cost')), 0) AS cost
        FROM ${SessionMessageTable}
        WHERE ${SessionMessageTable.session_id} = ${session.id}
          AND ${SessionMessageTable.type} = 'assistant'
          AND ${SessionMessageTable.seq} >= ${boundary.seq}
      `,
      )
      .pipe(Effect.orDie)
    if (
      usage &&
      (usage.input + usage.output + usage.reasoning + usage.cacheRead + usage.cacheWrite > 0 || usage.cost > 0)
    )
      yield* bus.publish(SessionEvent.UsageRecorded, {
        sessionID: session.id,
        source: "revert",
        cost: Money.USD.make(usage.cost),
        tokens: {
          input: usage.input,
          output: usage.output,
          reasoning: usage.reasoning,
          cache: { read: usage.cacheRead, write: usage.cacheWrite },
        },
      })
  }
  yield* bus.publish(SessionEvent.RevertEvent.Committed, {
    sessionID: session.id,
    to: session.revert.messageID,
  })
})

const plan = Effect.fn("SessionRevert.plan")(function* (db: Database.Interface["db"], input: BoundaryInput) {
  const boundary = yield* db
    .select({ seq: SessionMessageTable.seq })
    .from(SessionMessageTable)
    .where(and(eq(SessionMessageTable.session_id, input.sessionID), eq(SessionMessageTable.id, input.messageID)))
    .get()
    .pipe(Effect.orDie)
  if (!boundary) return yield* new MessageNotFoundError(input)
  const rows = yield* db
    .select()
    .from(SessionMessageTable)
    .where(
      and(
        eq(SessionMessageTable.session_id, input.sessionID),
        eq(SessionMessageTable.type, "assistant"),
        gt(SessionMessageTable.seq, boundary.seq),
      ),
    )
    .orderBy(asc(SessionMessageTable.seq))
    .all()
    .pipe(Effect.orDie)
  const files = new Map<RelativePath, Snapshot.ID>()
  for (const row of rows) {
    const message = SessionHistory.decodeMessageRowSync(row)
    if (message.type !== "assistant" || !message.snapshot?.start) continue
    for (const file of message.snapshot.files ?? [])
      if (!files.has(file)) files.set(file, Snapshot.ID.make(message.snapshot.start))
  }
  return files
})
