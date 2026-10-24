export * as FileAccess from "./file-access.js"

import { makeLocationNode } from "@opencode/util/effect/app-node"
import { FSUtil } from "@opencode/util/fs-util"
import { Global } from "@opencode/util/global"
import { Array, Context, Effect, Layer, Schema } from "effect"
import path from "path"
import fs from "node:fs"
import { Location } from "./location.js"
import { Permission } from "./permission.js"
import { Project } from "./project.js"
import { AbsolutePath } from "./schema.js"
import type { SessionErrors } from "./session/error.js"
import type { Tool } from "./tool.js"

export const Kind = Schema.Literals(["file", "directory"])
export type Kind = typeof Kind.Type

export const ResolveInput = Schema.Struct({
  path: Schema.String,
  /** Selects the external approval boundary; it does not validate the target type. */
  kind: Kind.pipe(Schema.optional),
})
export type ResolveInput = typeof ResolveInput.Type

export interface ExternalDirectoryAuthorization {
  readonly action: "external_directory"
  /** Lexical directory used as the external approval boundary. */
  readonly directory: AbsolutePath
  readonly resource: string
  readonly save: string
}

export interface Target {
  readonly absolute: AbsolutePath
  /** Location-relative for internal paths, absolute for external paths. */
  readonly resource: string
  /** Permission resource derived from the resolved (real) path, used to defeat symlink bypasses. */
  readonly realResource: string
  /** Real (symlink-resolved) absolute path of the target, when it differs from `absolute`. */
  readonly realAbsolute?: AbsolutePath
  readonly externalDirectory?: ExternalDirectoryAuthorization
}

export type Invocation = Pick<Tool.Context, "sessionID" | "agent" | "messageID" | "id">

export interface ReadOptions {
  /** A target already authorized by this invocation, used for filename recovery. */
  readonly siblingOf: Target
}

export interface Interface {
  /** Resolve a lexical path and its permission resources, without requesting approval. */
  readonly resolve: (input: ResolveInput) => Effect.Effect<Target, FSUtil.Error>
  /** Approve external directories in one batch, preserving first-seen resource order. */
  readonly authorizeExternal: (
    targets: readonly Target[],
    context: Invocation,
    metadata?: Permission.AssertInput["metadata"],
  ) => Effect.Effect<void, Permission.Error | SessionErrors.NotFoundError>
  /** Resolve a read target and obtain external-directory approval before read approval. */
  readonly authorizeRead: (
    file: string,
    context: Invocation,
    options?: ReadOptions,
  ) => Effect.Effect<Target, FSUtil.Error | Permission.Error | SessionErrors.NotFoundError>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/FileAccess") {}

/** Expand a leading ~ and normalize Windows shell paths before lexical resolution. */
export const resolvePath = (directory: string, input: string, home = Global.Path.home) => {
  const normalized = FSUtil.windowsPath(input)
  return path.resolve(
    directory,
    normalized === "~"
      ? home
      : normalized.startsWith("~/") || (process.platform === "win32" && normalized.startsWith("~\\"))
        ? path.join(home, normalized.slice(2))
        : normalized,
  )
}

const slash = (value: string) => value.replaceAll("\\", "/")
const invocation = (context: Invocation) => ({
  sessionID: context.sessionID,
  agent: context.agent,
  source: { type: "tool" as const, messageID: context.messageID, id: context.id },
})

/** Resolve symlinks for the longest existing prefix of a path (handles not-yet-existing files). */
const realPathLongestPrefix = (p: string): string => {
  const tail: string[] = []
  let current = p
  while (true) {
    try {
      const real = fs.realpathSync(current)
      return tail.length === 0 ? real : path.join(real, ...tail.reverse())
    } catch (e: any) {
      const code = e?.code
      if (!["ENOENT", "ENOTDIR", "EPERM", "EACCES"].includes(code)) return p
      const parent = path.dirname(current)
      if (parent === current) return p
      tail.push(path.basename(current))
      current = parent
    }
  }
}

const containsCI = (parent: string, child: string) =>
  process.platform === "win32"
    ? FSUtil.contains(parent.toLowerCase(), child.toLowerCase())
    : FSUtil.contains(parent, child)

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const fs = yield* FSUtil.Service
    const location = yield* Location.Service
    const permission = yield* Permission.Service

    const resolve = Effect.fn("FileAccess.resolve")(function* (input: ResolveInput) {
      const absolute = AbsolutePath.make(resolvePath(location.directory, input.path))
      const realAbsoluteStr = realPathLongestPrefix(absolute as string)
      const realAbsolute = AbsolutePath.make(realAbsoluteStr)
      const worktree = path.resolve(location.project.directory)
      const realDirectory = FSUtil.resolve(location.directory)
      const realWorktree = FSUtil.resolve(location.project.directory)
      const lexicalInternal =
        FSUtil.contains(location.directory, absolute as string) ||
        (worktree !== path.parse(worktree).root && FSUtil.contains(worktree, absolute as string))
      const realInternal =
        containsCI(realDirectory, realAbsoluteStr) ||
        (realWorktree !== path.parse(realWorktree).root && containsCI(realWorktree, realAbsoluteStr))
      const internal = lexicalInternal && realInternal
      const samePath =
        process.platform === "win32"
          ? realAbsoluteStr.toLowerCase() === (absolute as string).toLowerCase()
          : realAbsoluteStr === (absolute as string)
      if (internal) {
        const resource = slash(path.relative(location.directory, absolute as string) || ".")
        const realResourceRaw = slash(path.relative(realDirectory, realAbsoluteStr) || ".")
        const realResource = samePath ? resource : realResourceRaw
        return {
          absolute,
          resource,
          realResource: realResource === resource ? resource : realResource,
          realAbsolute: samePath ? undefined : realAbsolute,
        } satisfies Target
      }
      const type =
        input.kind === "directory"
          ? "Directory"
          : input.kind === "file"
            ? "File"
            : (yield* fs.stat(absolute).pipe(Effect.catchReason("PlatformError", "NotFound", () => Effect.undefined)))
                ?.type
      const directory = AbsolutePath.make(type === "Directory" ? realAbsoluteStr : path.dirname(realAbsoluteStr))
      const realResource = slash(realAbsoluteStr)
      return {
        absolute,
        resource: slash(absolute as string),
        realResource: samePath ? slash(absolute as string) : realResource,
        realAbsolute: samePath ? undefined : realAbsolute,
        externalDirectory: {
          action: "external_directory",
          directory,
          resource: slash(path.join(directory as string, "*")),
          save: slash(path.join((yield* Project.root(fs, directory)) ?? directory, "*")),
        },
      } satisfies Target
    })

    const authorizeExternal = Effect.fn("FileAccess.authorizeExternal")(function* (
      targets: readonly Target[],
      context: Invocation,
      metadata?: Permission.AssertInput["metadata"],
    ) {
      const external = Array.dedupeWith(
        targets.flatMap((target) => (target.externalDirectory ? [target.externalDirectory] : [])),
        (left, right) => left.resource === right.resource,
      )
      if (external.length === 0) return
      yield* permission.assert({
        action: "external_directory",
        resources: external.map((item) => item.resource),
        save: external.map((item) => item.save),
        ...(metadata === undefined ? {} : { metadata }),
        ...invocation(context),
      })
    })

    const authorizeRead = Effect.fn("FileAccess.authorizeRead")(function* (
      file: string,
      context: Invocation,
      options?: ReadOptions,
    ) {
      const target = yield* resolve({ path: file, kind: options ? "file" : undefined })
      const sibling = options && path.dirname(target.absolute as string) === path.dirname(options.siblingOf.absolute as string)

      // Filename recovery shares the directory approval, but checks the recovered file's own read rules.
      if (!sibling) yield* authorizeExternal([target], context)
      const resources =
        target.realResource && target.realResource !== target.resource
          ? [target.resource, target.realResource]
          : [target.resource]
      yield* permission.assert({
        action: "read",
        resources,
        save: ["*"],
        ...invocation(context),
      })
      return target
    })

    return Service.of({ resolve, authorizeExternal, authorizeRead })
  }),
)

export const node = makeLocationNode({ service: Service, layer, deps: [FSUtil.node, Location.node, Permission.node] })
