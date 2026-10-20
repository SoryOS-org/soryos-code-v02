import {
  Agent,
  Command,
  Connection,
  Credential,
  Integration,
  Model,
  Plugin,
  Provider,
  Reference,
  Skill,
} from "@lutungcode/plugin/effect"
import { Tool } from "@lutungcode/schema/tool"

const key = Symbol.for("lutungcode.plugin.v2.effect")
;(globalThis as typeof globalThis & { [key]?: unknown })[key] = {
  Agent,
  Command,
  Connection,
  Credential,
  Integration,
  Model,
  Plugin,
  Provider,
  Reference,
  Skill,
  Tool: { Error: Tool.Error },
}
