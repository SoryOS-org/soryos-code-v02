import { expect, test } from "bun:test"
import { tool } from "@opencode-ai/plugin/tool"
import githubPrSearch from "../tool/github-pr-search.ts"
import githubTriage from "../tool/github-triage.ts"

test("GitHub tools load with the installed OpenCode tool SDK", () => {
  expect(githubPrSearch.description).toContain("search GitHub pull requests")
  expect(githubPrSearch.args.query).toBeInstanceOf(tool.schema.ZodString)
  expect(githubPrSearch.execute).toBeFunction()

  expect(githubTriage.description).toContain("assign a GitHub issue")
  expect(githubTriage.args.team).toBeInstanceOf(tool.schema.ZodEnum)
  expect(githubTriage.execute).toBeFunction()
})

test("GitHub triage arguments validate and convert to JSON Schema", () => {
  const schema = tool.schema.object(githubTriage.args)
  expect(schema.parse({ team: "core" })).toEqual({ team: "core" })
  expect(schema.safeParse({ team: "not-a-team" }).success).toBe(false)

  expect(tool.schema.toJSONSchema(schema, { io: "input" })).toMatchObject({
    type: "object",
    properties: {
      team: { enum: ["tui", "desktop_web", "core", "inference", "windows"] },
    },
    required: ["team"],
  })
})

test("GitHub PR search arguments validate defaults and convert to JSON Schema", () => {
  const schema = tool.schema.object(githubPrSearch.args)
  expect(schema.parse({ query: "quota" })).toEqual({ query: "quota", limit: 10, offset: 0 })
  expect(schema.parse({ query: "quota", limit: 5, offset: 10 })).toEqual({
    query: "quota",
    limit: 5,
    offset: 10,
  })
  expect(schema.safeParse({ query: 7 }).success).toBe(false)
  expect(schema.safeParse({ query: "quota", limit: "10" }).success).toBe(false)

  expect(tool.schema.toJSONSchema(schema, { io: "input" })).toMatchObject({
    type: "object",
    properties: {
      query: { type: "string" },
      limit: { type: "number", default: 10 },
      offset: { type: "number", default: 0 },
    },
    required: ["query"],
  })
})
