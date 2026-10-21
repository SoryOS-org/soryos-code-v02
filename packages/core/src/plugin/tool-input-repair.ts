export * as ToolInputRepairPlugin from "./tool-input-repair.js"

import { define } from "@opencode/plugin/effect/plugin"
import { isDeepStrictEqual } from "node:util"
import { Effect, JsonSchema, Option, Predicate, Schema } from "effect"
import { definition } from "../tool/runtime.js"

// Repairs apply only when the input schema unambiguously supports them:
// - Stringified root or nested object: '{"limit":"20"}' -> { limit: 20 }
// - Closed object: { limit: "20", extra: true } -> { limit: 20 }
// - Optional null or empty-object placeholder: { limit: null } -> {}
// - Numeric or boolean string: { limit: "20", enabled: "false" } -> { limit: 20, enabled: false }
// - Nullable field: { count: "2" } -> { count: 2 }
// - Stringified array or compatible item: { tags: '["a"]', count: "2" } -> { tags: ["a"], count: [2] }
// - Positional tuple: { pair: ["2", "false"] } -> { pair: [2, false] }
// - Typed dictionary: { counts: { first: "2" } } -> { counts: { first: 2 } }
// - Nested fields and local references: { items: [{ count: "2" }] } -> { items: [{ count: 2 }] }

const decodeJson = Schema.decodeUnknownOption(Schema.fromJsonString(Schema.Unknown))
const maxDepth = 6

export const Plugin = define({
  id: "opencode.tool.input.repair",
  effect: (ctx) =>
    ctx.tool.hook("execute.before", (event) =>
      Effect.gen(function* () {
        // The outer Code Mode tool is built per snapshot rather than registered, so it cannot be
        // looked up here. Its `{ code }` input is trivial; the tools it calls are repaired normally.
        if (event.tool === "execute") return
        const tool = (yield* ctx.tool.list()).find((tool) => tool.id === event.tool)
        if (!tool) return
        const schema = definition(tool).inputSchema
        if (schema.type !== "object" && ![schema.allOf, schema.anyOf, schema.oneOf].some(Array.isArray)) return
        event.input = repair(event.input, schema, schema, 0)
      }),
    ),
})

function repair(
  value: unknown,
  schema: JsonSchema.JsonSchema,
  root: JsonSchema.JsonSchema,
  depth: number,
  preserve = false,
): unknown {
  if (depth > maxDepth) return value

  const branches = Array.isArray(schema.oneOf) ? schema.oneOf : schema.anyOf
  if (Array.isArray(branches) && !(Array.isArray(schema.oneOf) && Array.isArray(schema.anyOf))) {
    const parsed = typeof value === "string" ? Option.getOrUndefined(decodeJson(value)) : value
    const objects =
      schema.type === "object" || branches.every((branch) => Predicate.isObject(branch) && branch.type === "object")
    if (Predicate.isObject(parsed) && (typeof value !== "string" || objects)) {
      const candidates = branches.filter((branch) => Predicate.isObject(branch) && objectBranch(parsed, branch, depth))
      const { anyOf, oneOf, ...base } = schema
      const repaired = repair(parsed, base, root, depth + 1, true)
      const results =
        Array.isArray(schema.oneOf) && candidates.length !== 1
          ? []
          : candidates.map((selected) =>
              repair(repaired, { ...selected, type: selected.type ?? "object" }, root, depth + 1, true),
            )
      if (results.length > 0 && results.every((result) => isDeepStrictEqual(result, results[0]))) return results[0]
    }
  }

  if (Array.isArray(schema.allOf)) {
    const { allOf, ...base } = schema
    const parts = [base, ...allOf]
    if (parts.some((part) => !Predicate.isObject(part))) return value
    const types = [...new Set(parts.flatMap((part) => (typeof part.type === "string" ? [part.type] : [])))]
    if (types.length > 1) return value
    const properties = new Map<string, unknown>()
    for (const part of parts) {
      if (!Predicate.isObject(part.properties)) continue
      for (const [key, property] of Object.entries(part.properties)) {
        if (properties.has(key)) return value
        properties.set(key, property)
      }
    }
    return repair(value, { ...base, type: types[0], properties: Object.fromEntries(properties) }, root, depth + 1, true)
  }

  if (typeof schema.$ref === "string") {
    const definitions = /^#\/\$defs\/[^/]+$/.test(schema.$ref)
      ? root.$defs
      : /^#\/definitions\/[^/]+$/.test(schema.$ref)
        ? root.definitions
        : undefined
    if (!Predicate.isObject(definitions)) return value
    const target = Object.fromEntries(
      Object.entries(definitions).filter((entry): entry is [string, JsonSchema.JsonSchema] =>
        Predicate.isObject(entry[1]),
      ),
    )[
      schema.$ref
        .slice(schema.$ref.lastIndexOf("/") + 1)
        .replaceAll("~1", "/")
        .replaceAll("~0", "~")
    ]
    return target ? repair(value, target, root, depth + 1, preserve) : value
  }

  if (Array.isArray(schema.type)) {
    if (value === null && schema.type.includes("null")) return value
    if (schema.type.includes(typeof value)) return value
    const types = schema.type.filter((type) => type !== "null")
    return types.length === 1 ? repair(value, { ...schema, type: types[0] }, root, depth + 1, preserve) : value
  }

  if (schema.type === undefined) {
    if (Array.isArray(schema.anyOf) && Array.isArray(schema.oneOf)) return value
    const branches = Array.isArray(schema.anyOf) ? schema.anyOf : schema.oneOf
    if (!Array.isArray(branches) || value === null) return value
    if (branches.some((branch) => !Predicate.isObject(branch) || branch.type === typeof value)) return value
    const candidates = branches.filter((branch) => Predicate.isObject(branch) && branch.type !== "null")
    return candidates.length === 1 ? repair(value, candidates[0], root, depth + 1, preserve) : value
  }

  if (schema.type === "number" || schema.type === "integer") {
    if (typeof value !== "string" || value.trim() === "") return value
    const parsed = Number(value)
    return Number.isFinite(parsed) && (schema.type !== "integer" || Number.isSafeInteger(parsed)) ? parsed : value
  }
  if (schema.type === "boolean") return value === "true" ? true : value === "false" ? false : value
  if (schema.type === "object") return repairObject(value, schema, root, depth, preserve)
  if (schema.type === "array") return repairArray(value, schema, root, depth)
  return value
}

function objectBranch(value: Record<string, unknown>, schema: JsonSchema.JsonSchema, depth: number): boolean {
  if (depth > maxDepth) return true
  if (
    schema.type !== undefined &&
    schema.type !== "object" &&
    !(Array.isArray(schema.type) && schema.type.includes("object"))
  )
    return false
  if (Array.isArray(schema.required) && schema.required.some((key) => !Object.hasOwn(value, key))) return false
  if (
    Array.isArray(schema.allOf) &&
    !schema.allOf.every((branch) => Predicate.isObject(branch) && objectBranch(value, branch, depth + 1))
  )
    return false
  if (!Predicate.isObject(schema.properties)) return true
  return Object.entries(schema.properties).every(([key, property]) => {
    if (!Object.hasOwn(value, key) || !Predicate.isObject(property)) return true
    if (
      "const" in property &&
      (property.const === null || typeof property.const !== "object") &&
      property.const !== value[key]
    )
      return false
    if (
      Array.isArray(property.enum) &&
      property.enum.every((item) => item === null || typeof item !== "object") &&
      !property.enum.includes(value[key])
    )
      return false
    return true
  })
}

function repairObject(
  value: unknown,
  schema: JsonSchema.JsonSchema,
  root: JsonSchema.JsonSchema,
  depth: number,
  preserve: boolean,
): unknown {
  const parsed = typeof value === "string" ? Option.getOrUndefined(decodeJson(value)) : value
  if (!Predicate.isObject(parsed)) return value

  const properties = Predicate.isObject(schema.properties) ? schema.properties : {}
  const required = Array.isArray(schema.required) ? schema.required : []
  const patterned = Predicate.isObject(schema.patternProperties)
  const composed = preserve || Array.isArray(schema.allOf) || Array.isArray(schema.anyOf) || Array.isArray(schema.oneOf)

  return Object.keys(parsed).reduce<Record<string, unknown>>((result, key) => {
    const current = result[key]
    const declared = Object.hasOwn(properties, key)
    const property = declared ? properties[key] : !patterned ? schema.additionalProperties : undefined

    if (!declared && schema.additionalProperties === false && !patterned && !composed) {
      const next = { ...result }
      delete next[key]
      return next
    }
    if (!Predicate.isObject(property)) return result

    // Only a bare single-type property provably rejects null and `{}`. Compositions, enums,
    // constants, references and nullable flags may accept them, so those are left alone.
    const plain =
      typeof property.type === "string" &&
      property.type !== "null" &&
      !composed &&
      ["anyOf", "oneOf", "allOf", "enum", "const", "$ref", "nullable"].every((keyword) => !(keyword in property))
    const placeholder = Predicate.isObject(current) && Object.keys(current).length === 0 && property.type !== "object"
    if (declared && !required.includes(key) && plain && (current === null || placeholder)) {
      const next = { ...result }
      delete next[key]
      return next
    }

    const repaired = repair(current, property, root, depth + 1)
    return repaired === current ? result : { ...result, [key]: repaired }
  }, parsed)
}

function repairArray(
  value: unknown,
  schema: JsonSchema.JsonSchema,
  root: JsonSchema.JsonSchema,
  depth: number,
): unknown {
  const parsed = typeof value === "string" ? Option.getOrUndefined(decodeJson(value)) : value
  const tuple = Array.isArray(schema.prefixItems)
    ? schema.prefixItems
    : Array.isArray(schema.items)
      ? schema.items
      : undefined

  if (Array.isArray(parsed)) {
    const repaired = parsed.map((item, index) => {
      const member = tuple
        ? (tuple[index] ?? (Array.isArray(schema.prefixItems) ? schema.items : schema.additionalItems))
        : schema.items
      return Predicate.isObject(member) ? repair(item, member, root, depth + 1) : item
    })
    return repaired.every((item, index) => item === parsed[index]) ? parsed : repaired
  }

  if (tuple || !Predicate.isObject(schema.items)) return value
  const repaired = repair(value, schema.items, root, depth + 1)
  const type = schema.items.type
  const compatible =
    type === "object"
      ? Predicate.isObject(repaired)
      : type === "array"
        ? Array.isArray(repaired)
        : type === "integer"
          ? typeof repaired === "number" && Number.isSafeInteger(repaired)
          : type === "number"
            ? typeof repaired === "number" && Number.isFinite(repaired)
            : (type === "string" || type === "boolean") && typeof repaired === type
  return compatible ? [repaired] : value
}
