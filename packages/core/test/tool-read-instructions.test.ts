import { afterAll, describe, expect } from "bun:test"
import fs from "node:fs"
import fsp from "node:fs/promises"
import os from "node:os"
import path from "path"
import { Effect, Layer } from "effect"
import { Config } from "@opencode/core/config"
import { AppNodeBuilder } from "@opencode/core/effect/app-node-builder"
import { LayerNode } from "@opencode/util/effect/layer-node"
import { FSUtil } from "@opencode/util/fs-util"
import { Location } from "@opencode/core/location"
import { Image } from "@opencode/core/image"
import { Permission } from "@opencode/core/permission"
import { Session } from "@opencode/core/session"
import { AbsolutePath } from "@opencode/core/schema"
import { Global } from "@opencode/util/global"
import { FileAccess } from "@opencode/core/file-access"
import { location } from "./fixture/location"
import { Tool } from "@opencode/core/tool"
import { ReadTool } from "@opencode/core/tool/plugin/read"
import { ReadToolFileSystem } from "@opencode/core/tool/read-filesystem"
import { makeLocationNode } from "@opencode/util/effect/app-node"
import { SessionInstructions } from "@opencode/core/session/instructions"
import { testEffect } from "./lib/effect"
import { permissionLayer } from "./lib/permission"
import { toolIdentity, executeTool, registerToolPlugin } from "./lib/tool"

const readToolNode = makeLocationNode({
  name: "test/read-instructions-plugin",
  layer: Layer.effectDiscard(registerToolPlugin(ReadTool.Plugin)),
  deps: [
    Tool.node,
    ReadToolFileSystem.node,
    FileAccess.node,
    Image.node,
    Permission.node,
    SessionInstructions.node,
    FSUtil.node,
    Location.node,
  ],
})

const loads: { sessionID: string; paths: ReadonlyArray<string> }[] = []

const reader = Layer.succeed(
  ReadToolFileSystem.Service,
  ReadToolFileSystem.Service.of({
    list: () => Effect.succeed([]),
    read: () =>
      Effect.succeed({
        type: "file" as const,
        uri: "file:///read",
        name: "read",
        content: "content",
        encoding: "utf8",
        mime: "text/plain",
      }),
  }),
)

const instructions = Layer.succeed(
  SessionInstructions.Service,
  SessionInstructions.Service.of({
    load: (input) =>
      Effect.sync(() => {
        loads.push({ sessionID: input.sessionID, paths: input.paths })
      }),
  }),
)

// A workspace nested inside a larger project, so a sibling read is inside the
// project root (not an external-directory read) but outside the workspace.
const projectRoot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "opencode-read-instructions-")))
const workspaceRoot = path.join(projectRoot, "proj-a")
const locationLayer = Layer.succeed(
  Location.Service,
  Location.Service.of(
    location(
      { directory: AbsolutePath.make(workspaceRoot) },
      { projectDirectory: AbsolutePath.make(projectRoot) },
    ),
  ),
)

afterAll(() => {
  fs.rmSync(projectRoot, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
})

const config = Config.testLayer()
const image = Layer.mock(Image.Service, {
  normalize: () => Effect.fail(new Image.ResizerUnavailableError()),
})

const readLayer = Layer.mergeAll(
  AppNodeBuilder.build(LayerNode.group([Tool.node, readToolNode]), [
    ReadToolFileSystem.node.replace(reader),
    Permission.node.replace(permissionLayer({ assert: () => Effect.void })),
    Config.node.replace(config),
    Image.node.replace(image),
    Location.node.replace(locationLayer),
    SessionInstructions.node.replace(instructions),
    Global.node.replace(Global.layerWith({ data: Global.Path.data })),
  ]),
  config,
  image,
)

const it = testEffect(readLayer)
const sessionID = Session.ID.make("ses_read_instructions_test")

describe("ReadTool instructions", () => {
  it.effect("does not inject AGENTS.md from a sibling directory outside the workspace", () =>
    Effect.gen(function* () {
      loads.length = 0
      const project = projectRoot
      const workspace = workspaceRoot
      const sibling = path.join(project, "proj-b")
      const nested = path.join(workspace, "src")
      yield* Effect.promise(async () => {
        await fsp.mkdir(nested, { recursive: true })
        await fsp.mkdir(sibling, { recursive: true })
        await fsp.writeFile(path.join(workspace, "AGENTS.md"), "PROJECT-A")
        await fsp.writeFile(path.join(nested, "AGENTS.md"), "PROJECT-SRC")
        await fsp.writeFile(path.join(sibling, "AGENTS.md"), "PROJECT-B")
        await fsp.writeFile(path.join(sibling, "notes.txt"), "notes")
        await fsp.writeFile(path.join(nested, "a.ts"), "export const a = 1")
      })

      const registry = yield* Tool.Service

      const siblingRead = yield* executeTool(registry, {
        sessionID,
        ...toolIdentity,
        call: { type: "tool-call", id: "call-sibling", name: "read", input: { path: "../proj-b/notes.txt" } },
      })
      expect(siblingRead.status).toBe("completed")
      expect(loads).toEqual([])

      const insideRead = yield* executeTool(registry, {
        sessionID,
        ...toolIdentity,
        call: { type: "tool-call", id: "call-inside", name: "read", input: { path: "src/a.ts" } },
      })
      expect(insideRead.status).toBe("completed")
      expect(loads).toHaveLength(1)
      expect(loads[0]?.paths).toEqual([path.join(nested, "AGENTS.md")])
    }),
  )
})
