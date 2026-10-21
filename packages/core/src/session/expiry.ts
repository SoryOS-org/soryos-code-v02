export * as SessionExpiry from "./expiry.js"

import { and, asc, isNull, lt } from "drizzle-orm"
import { Clock, Duration, Effect, Layer, Schedule } from "effect"
import type { Document } from "@opencode/schema/config"
import { FSUtil } from "@opencode/util/fs-util"
import { Global } from "@opencode/util/global"
import { AppProcess } from "@opencode/util/process"
import { makeGlobalNode } from "@opencode/util/effect/app-node"
import { AbsolutePath } from "../schema.js"
import { Bus } from "../bus.js"
import { Config } from "../config.js"
import { Credential } from "../credential.js"
import { Database } from "../database/database.js"
import { Watcher } from "../filesystem/watcher.js"
import { Job } from "../job.js"
import { Location } from "../location.js"
import { Project } from "../project.js"
import { Session } from "../session.js"
import { WellKnown } from "../wellknown.js"
import { SessionExecution } from "./execution.js"
import { SessionTable } from "./sql.js"

const SWEEP_INTERVAL = Duration.hours(1)

/** Reads `storage.sessions` from global, system, and managed config. Project config never applies. */
export const configured = Effect.fn("SessionExpiry.configured")(function* () {
  const global = yield* Global.Service
  const directory = AbsolutePath.make(global.config)
  // A Location standing on the global config directory loads global config without walking a project tree.
  return yield* Effect.gen(function* () {
    const config = yield* Config.Service
    const entries = yield* config.entries()
    return entries.findLast(
      (entry): entry is Document => entry.type === "document" && entry.info.storage?.sessions !== undefined,
    )?.info.storage?.sessions
  }).pipe(
    Effect.provide(
      Config.layer({ project: false, claude: false }).pipe(
        Layer.provide(
          Layer.succeed(
            Location.Service,
            Location.Service.of({
              directory,
              project: { id: Project.ID.global, directory, canonical: directory },
            }),
          ),
        ),
      ),
    ),
  )
})

/**
 * Deletes top-level Sessions, with their children, whose last activity is older than `maxAge`.
 * Returns the deleted Session count.
 */
export const expire = Effect.fn("SessionExpiry.expire")(function* (maxAge: Duration.Duration) {
  const { db } = yield* Database.Service
  const execution = yield* SessionExecution.Service
  const jobs = yield* Job.Service
  const sessions = yield* Session.Service
  const cutoff = (yield* Clock.currentTimeMillis) - Duration.toMillis(maxAge)
  // Suspended Sessions belong to restart recovery, which resumes or terminalizes them.
  const expired = yield* db
    .select({ id: SessionTable.id })
    .from(SessionTable)
    .where(
      and(isNull(SessionTable.parent_id), isNull(SessionTable.time_suspended), lt(SessionTable.time_updated, cutoff)),
    )
    .orderBy(asc(SessionTable.time_updated))
    .all()
    .pipe(Effect.orDie)
  if (expired.length === 0) return 0
  // Waiting on a question, a long tool call, or a background job emits no activity.
  const occupied = new Set([
    ...(yield* execution.active),
    ...(yield* jobs.runningBackground).flatMap((recovery) =>
      recovery.kind === "shell" ? [recovery.sessionID] : [recovery.childSessionID, recovery.parentSessionID],
    ),
  ])
  const removable = expired.filter((row) => !occupied.has(row.id))
  yield* Effect.forEach(
    removable,
    (row) => sessions.remove(row.id).pipe(Effect.catchTag("Session.NotFoundError", () => Effect.void)),
    { discard: true },
  )
  return removable.length
})

/** Applies the global `storage.sessions` config. Unset keeps every Session. */
export const sweep = Effect.fn("SessionExpiry.sweep")(function* () {
  const maxAge = yield* configured()
  if (maxAge === undefined) return
  const millis = Duration.toMillis(maxAge)
  if (!Number.isFinite(millis) || millis <= 0) {
    yield* Effect.logWarning("storage.sessions must be a finite positive duration")
    return
  }
  const count = yield* expire(maxAge)
  if (count === 0) return
  yield* Effect.logInfo("deleted expired sessions", { count, maxAge: Duration.format(maxAge) })
})

export const node = makeGlobalNode({
  name: "session-expiry-sweep",
  layer: Layer.effectDiscard(
    sweep().pipe(
      Effect.ignoreCause({ log: "Error", message: "Session expiry sweep failed" }),
      Effect.repeat(Schedule.spaced(SWEEP_INTERVAL)),
      Effect.forkScoped,
    ),
  ),
  deps: [
    AppProcess.node,
    Bus.node,
    Credential.node,
    Database.node,
    FSUtil.node,
    Global.node,
    Job.node,
    Session.node,
    SessionExecution.node,
    Watcher.node,
    WellKnown.node,
  ],
})
