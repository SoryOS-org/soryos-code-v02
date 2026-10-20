import type { Disposable } from "vscode"
import { fileChanges, type Change, type FileDiff } from "./patch"
import { api, discover, type Endpoint, type ReviewEvent, type SessionInfo } from "../server"

export type Call = {
  readonly sessionID: string
  readonly messageID: string
  readonly partID: string
  readonly name: string
  readonly changes: readonly Change[]
  /** Per-change review state, aligned with `changes`. */
  readonly review: readonly ("pending" | "kept" | "discarded")[]
}

export type ChangeRef = {
  readonly call: Call
  readonly change: Change
  readonly state: "pending" | "kept" | "discarded"
}

const REVIEWABLE = new Set(["edit", "write", "patch"])

/** Live review state for one session, folded from messages and server events. */
export class ReviewStore {
  private endpoint: Endpoint | undefined
  private sessions: SessionInfo[] = []
  private calls = new Map<string, Call>()
  private sequence = 0

  readonly onDidChange = new Emitter<void>()
  readonly onTurnEnd = new Emitter<void>()

  constructor(private readonly connect: () => Promise<Endpoint | undefined> = discover) {}

  sessionID(): string | undefined {
    return this.selected ?? this.sessions[0]?.id
  }

  session(): SessionInfo | undefined {
    const id = this.sessionID()
    return this.sessions.find((session) => session.id === id)
  }

  sessionList(): readonly SessionInfo[] {
    return this.sessions
  }

  private selected: string | undefined

  select(sessionID: string) {
    this.selected = sessionID
    void this.refresh()
  }

  async refresh(): Promise<void> {
    if (!this.endpoint) this.endpoint = await this.connect()
    if (!this.endpoint) return
    const client = api(this.endpoint)
    this.sessions = await client.sessions()
    const sessionID = this.sessionID()
    if (!sessionID) {
      this.calls.clear()
      this.onDidChange.fire()
      return
    }
    const messages = await client.messages(sessionID)
    const calls = new Map<string, Call>()
    for (const message of messages)
      for (const part of message.parts) {
        if (!REVIEWABLE.has(part.name) || part.files.length === 0) continue
        calls.set(part.id, makeCall(sessionID, message.id, part))
      }
    this.calls = calls
    this.onDidChange.fire()
  }

  /** Folds a server event into the store; unknown events are ignored. */
  handle(event: ReviewEvent): void {
    const data = event.data as {
      sessionID?: unknown
      assistantMessageID?: unknown
      id?: unknown
      changes?: unknown
      decision?: unknown
    }
    if (typeof data.sessionID !== "string" || data.sessionID !== this.sessionID()) return
    if (event.type === "session.tool.success") {
      void this.refresh()
      return
    }
    if (event.type === "session.tool.reviewed" && typeof data.id === "string") {
      const call = this.calls.get(data.id)
      if (!call || !Array.isArray(data.changes)) return
      const review = [...call.review]
      for (const index of data.changes) {
        if (typeof index !== "number") continue
        while (review.length <= index) review.push("pending")
        review[index] = data.decision === "keep" ? "kept" : "discarded"
      }
      this.calls.set(data.id, { ...call, review })
      this.onDidChange.fire()
      return
    }
    if (event.type.startsWith("session.execution.")) {
      if (event.type === "session.execution.succeeded") this.onTurnEnd.fire()
      return
    }
    if (event.type.startsWith("session.revert.")) void this.refresh()
  }

  /** Every change with its current review state, in change-index order across calls. */
  changes(): ChangeRef[] {
    return [...this.calls.values()].flatMap((call) =>
      call.changes.map((change, index) => ({
        call,
        change,
        state: call.review[index] ?? "pending",
      })),
    )
  }

  pending(): ChangeRef[] {
    return this.changes().filter((item) => item.state === "pending")
  }

  /** Pending changes touching one file, for editor decorations and per-file actions. */
  pendingFor(path: string): ChangeRef[] {
    return this.pending().filter((item) => item.change.file.file === path)
  }

  count(): number {
    return this.pending().length
  }

  /** Paths tool diffs record are relative to the session directory; editor URIs are absolute. */
  relative(absolute: string): string {
    const directory = this.session()?.directory
    if (!directory) return absolute
    const prefix = directory.endsWith("/") || directory.endsWith("\\") ? directory : `${directory}/`
    return absolute.startsWith(prefix) ? absolute.slice(prefix.length).replaceAll("\\", "/") : absolute
  }

  async keep(target: ChangeRef, all = false): Promise<void> {
    await this.decide(target, "keep", all)
  }

  async discard(target: ChangeRef, all = false): Promise<void> {
    await this.decide(target, "discard", all)
  }

  private async decide(target: ChangeRef, decision: "keep" | "discard", all: boolean): Promise<void> {
    const client = await this.client()
    const changes = all
      ? target.call.changes
          .map((change, index) => ({ change, index }))
          .filter((item) => (target.call.review[item.index] ?? "pending") === "pending")
          .map((item) => item.index)
      : [target.change.index]
    await client.review(target.call.sessionID, target.call.messageID, target.call.partID, decision, changes)
    await this.refresh()
  }

  async keepAll(): Promise<void> {
    await this.eachPending("keep")
  }

  async discardAll(): Promise<void> {
    await this.eachPending("discard")
  }

  private async eachPending(decision: "keep" | "discard"): Promise<void> {
    const client = await this.client()
    for (const call of this.calls.values()) {
      const changes = call.changes
        .map((change, index) => ({ change, index }))
        .filter((item) => (call.review[item.index] ?? "pending") === "pending")
        .map((item) => item.index)
      if (changes.length === 0) continue
      await client.review(call.sessionID, call.messageID, call.partID, decision, changes)
    }
    await this.refresh()
  }

  async restoreCheckpoint(messageID: string): Promise<void> {
    const sessionID = this.sessionID()
    if (!sessionID) return
    await (await this.client()).restoreCheckpoint(sessionID, messageID)
    await this.refresh()
  }

  /** User prompts of the active session, newest first, for the checkpoint picker. */
  async requests(): Promise<{ id: string; text: string }[]> {
    const sessionID = this.sessionID()
    if (!sessionID) return []
    return (await (await this.client()).requests(sessionID)).reverse()
  }

  async restoreLatest(): Promise<void> {
    const sessionID = this.sessionID()
    if (!sessionID) return
    await (await this.client()).restoreLatest(sessionID)
    await this.refresh()
  }

  events(onEvent: (event: ReviewEvent) => void, signal: AbortSignal): Promise<void> {
    if (!this.endpoint) return Promise.resolve()
    return api(this.endpoint).events(onEvent, signal)
  }

  private async client() {
    if (!this.endpoint) this.endpoint = await this.connect()
    if (!this.endpoint) throw new Error("OpenCode service is not running")
    return api(this.endpoint)
  }
}

function makeCall(
  sessionID: string,
  messageID: string,
  part: { id: string; name: string; files: readonly FileDiff[]; review: readonly ("pending" | "kept" | "discarded")[] },
): Call {
  const changes = fileChanges(part.files)
  const review = changes.map((_, index) => part.review[index] ?? "pending")
  return { sessionID, messageID, partID: part.id, name: part.name, changes, review }
}

/** Minimal synchronous event emitter; the extension host never needs async delivery. */
class Emitter<T> {
  private listeners = new Set<(value: T) => void>()

  fire(value: T): void {
    for (const listener of [...this.listeners]) listener(value)
  }

  on(listener: (value: T) => void): Disposable {
    this.listeners.add(listener)
    return { dispose: () => this.listeners.delete(listener) }
  }
}
