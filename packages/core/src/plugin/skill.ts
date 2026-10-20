/// <reference path="../markdown.d.ts" />

export * as SkillPlugin from "./skill.js"

import { define, type Context } from "@lutungcode/plugin/effect/plugin"
import { Document } from "@lutungcode/schema/config"
import { Effect } from "effect"
import { AbsolutePath } from "../schema.js"
import { Skill } from "../skill.js"
import { Config } from "../config.js"
import os from "os"
import lutungcodeContent from "./skill/lutungcode.md" with { type: "text" }
import reportContent from "./skill/report.md" with { type: "text" }

export const LutungcodeContent = lutungcodeContent
export const ReportContent = reportContent

export const LutungcodeDescription =
  "Use this skill for any question about LutungCode itself, including how LutungCode works, using or configuring it, migrating from V1 to V2, troubleshooting it, developing plugins or integrations, using the LutungCode SDK, clients, server, or API, and contributing to the LutungCode codebase. Also use it for LutungCode agents, commands, skills, tools, permissions, MCP servers, providers, models, themes, keybinds, formatters, the CLI, TUI, desktop app, and web app."
const REPORT_DESCRIPTION =
  "Use when the user wants to report an lutungcode issue or bug. Collect standard diagnostics, add user-specific reproduction context, and publish the issue with GitHub CLI."

export const Plugin = define({
  id: "lutungcode.skill",
  effect: Effect.fn(function* (ctx) {
    const reportContent = yield* reportContentWithDiagnostics(ctx.app)
    yield* ctx.skill.transform((editor) => {
      editor.add(
        Skill.Info.make({
          id: Skill.ID.make("lutungcode"),
          name: Skill.Name.make("LutungCode"),
          description: LutungcodeDescription,
          path: AbsolutePath.make("/builtin/lutungcode.md"),
          content: LutungcodeContent,
        }),
      )
      editor.add(
        Skill.Info.make({
          id: Skill.ID.make("report"),
          name: Skill.Name.make("Report"),
          description: REPORT_DESCRIPTION,
          path: AbsolutePath.make("/builtin/report.md"),
          content: reportContent,
        }),
      )
    })
  }),
})

const reportContentWithDiagnostics = Effect.fn("SkillPlugin.reportContentWithDiagnostics")(function* (
  app: Context["app"],
) {
  const plugins = yield* configuredPlugins()
  // Under emulation on Windows ARM64, os.arch() reads x64 but PROCESSOR_IDENTIFIER still names the ARM host.
  const emulated =
    process.platform === "win32" && os.arch() === "x64" && process.env.PROCESSOR_IDENTIFIER?.startsWith("ARM")
  return [
    ReportContent,
    "",
    "## Runtime Diagnostics Snapshot",
    "",
    "These values were captured when the built-in report skill was registered. Verify them before publishing.",
    "",
    `- lutungcode version: ${app.version}`,
    `- install/channel: ${app.channel}`,
    `- OS: ${os.type()} ${os.release()} (${os.platform()} ${os.arch()}${emulated ? ", emulated on ARM64" : ""})`,
    `- Terminal: ${terminal()}`,
    `- Shell: ${shell()}`,
    `- Active plugins: ${plugins.length === 0 ? "None found in config" : plugins.join(", ")}`,
  ].join("\n")
})

const configuredPlugins = Effect.fn("SkillPlugin.configuredPlugins")(function* () {
  const config = yield* Config.Service
  return (yield* config.entries())
    .filter((entry): entry is Document => entry.type === "document")
    .flatMap((entry) => entry.info.plugins ?? [])
    .map((entry) => (typeof entry === "string" ? entry : entry.package))
    .toSorted()
})

function terminal() {
  return (
    [
      process.env.TERM_PROGRAM ? `TERM_PROGRAM=${process.env.TERM_PROGRAM}` : undefined,
      process.env.TERM ? `TERM=${process.env.TERM}` : undefined,
      process.env.COLORTERM ? `COLORTERM=${process.env.COLORTERM}` : undefined,
    ]
      .filter((item): item is string => item !== undefined)
      .join(", ") || "Unavailable: terminal environment variables are not set"
  )
}

function shell() {
  return (
    process.env.SHELL ??
    process.env.ComSpec ??
    process.env.COMSPEC ??
    "Unavailable: shell environment variable is not set"
  )
}
