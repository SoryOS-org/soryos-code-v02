import { Agent } from "@lutungcode/core/agent"
import { AISDK } from "@lutungcode/core/aisdk"
import { Command } from "@lutungcode/core/command"
import { Config } from "@lutungcode/core/config"
import { Credential } from "@lutungcode/core/credential"
import { Database } from "@lutungcode/core/database/database"
import { FileAccess } from "@lutungcode/core/file-access"
import { LayerNodePlatform } from "@lutungcode/util/effect/app-node-platform"
import { AppProcess } from "@lutungcode/util/process"
import { LayerNode } from "@lutungcode/util/effect/layer-node"
import { Bus } from "@lutungcode/core/bus"
import { FileSystem } from "@lutungcode/core/filesystem"
import { FSUtil } from "@lutungcode/util/fs-util"
import { Form } from "@lutungcode/core/form"
import { Generate } from "@lutungcode/core/generate"
import { Integration } from "@lutungcode/core/integration"
import { KV } from "@lutungcode/core/kv"
import { Location } from "@lutungcode/core/location"
import { ManagedPolicy } from "@lutungcode/core/managed-policy"
import { Mcp } from "@lutungcode/core/mcp/index"
import { Model } from "@lutungcode/core/model"
import { Npm } from "@lutungcode/util/npm"
import { Plugin } from "@lutungcode/core/plugin"
import { PluginHooks } from "@lutungcode/core/plugin/hooks"
import { Provider } from "@lutungcode/core/provider"
import { Session } from "@lutungcode/core/session"
import { PersistentPty } from "@lutungcode/core/persistent-pty"
import { LocationServiceMap } from "@lutungcode/core/location-service-map"
import { AppNodeBuilder } from "@lutungcode/core/effect/app-node-builder"
import { Permission } from "@lutungcode/core/permission"
import { Reference } from "@lutungcode/core/reference"
import { Rpc } from "@lutungcode/core/rpc"
import { Skill } from "@lutungcode/core/skill"
import { SkillDiscovery } from "@lutungcode/core/skill/discovery"
import { Watcher } from "@lutungcode/core/filesystem/watcher"
import { Tool } from "@lutungcode/core/tool"
import { Vcs } from "@lutungcode/core/vcs"
import { WebSearch } from "@lutungcode/core/websearch"
import { Worktree } from "@lutungcode/core/worktree"
import { WorktreeStrategies } from "@lutungcode/core/worktree/strategies"
import { Effect, Layer } from "effect"
import { tempLocationLayer } from "../fixture/location"
import { emptyMcpLayer } from "../fixture/mcp"

const npmLayer = Layer.succeed(
  Npm.Service,
  Npm.Service.of({
    add: (name) => Effect.succeed({ directory: "", name }),
    resolve: (name) => Effect.succeed({ directory: "", name }),
    check: () => Effect.succeed(false),
    update: (name) => Effect.succeed({ directory: "", name }),
    which: () => Effect.undefined,
  }),
)

const generateLayer = Layer.succeed(Generate.Service, Generate.Service.of({ text: () => Effect.succeed("") }))

const configLayer = Config.testLayer()

const permissionLayer = Layer.succeed(
  Permission.Service,
  Permission.Service.of({
    close: Effect.void,
    ask: (input) => Effect.succeed({ id: input.id ?? Permission.ID.create(), effect: "ask" }),
    assert: () => Effect.void,
    reply: () => Effect.void,
    get: () => Effect.succeed(undefined),
    forSession: () => Effect.succeed([]),
    list: () => Effect.succeed([]),
  }),
)

export const makePluginTestLayer = (permission = permissionLayer) =>
  AppNodeBuilder.build(
    LayerNode.group([
      AppProcess.node,
      FileSystem.node,
      FSUtil.node,
      Location.node,
      Npm.node,
      Credential.node,
      Config.node,
      Database.node,
      FileAccess.node,
      Bus.node,
      Form.node,
      Generate.node,
      LayerNodePlatform.httpClient,
      Plugin.node,
      Agent.node,
      AISDK.node,
      Provider.node,
      Model.node,
      Command.node,
      Integration.node,
      KV.node,
      ManagedPolicy.node,
      Mcp.node,
      Session.node,
      PersistentPty.node,
      LocationServiceMap.node,
      Permission.node,
      PluginHooks.node,
      Reference.node,
      Rpc.node,
      Skill.node,
      SkillDiscovery.node,
      Tool.node,
      Vcs.node,
      Watcher.node,
      WebSearch.node,
      Worktree.node,
      WorktreeStrategies.node,
    ]),
    [
      Location.node.replace(tempLocationLayer),
      Npm.node.replace(npmLayer),
      Config.node.replace(configLayer),
      Mcp.node.replace(emptyMcpLayer),
      Generate.node.replace(generateLayer),
      Permission.node.replace(permission),
    ],
  ).pipe(Layer.provideMerge(configLayer))

export const PluginTestLayer = makePluginTestLayer()
