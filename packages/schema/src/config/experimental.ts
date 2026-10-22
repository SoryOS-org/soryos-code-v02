export * as ConfigExperimental from "./experimental.js"

import { Schema } from "effect"
import { NonNegativeInt, optional } from "../schema.js"
import { ConfigPolicy } from "./policy.js"

export class Info extends Schema.Class<Info>("ConfigExperimental.Info")({
  portable_shell_scanner: Schema.Boolean.annotate({
    description: "Enable the experimental portable shell permission scanner. Defaults to false.",
  }).pipe(optional),
  todo: Schema.Boolean.annotate({
    description: "Enable the experimental todowrite tool. Defaults to false.",
  }).pipe(optional),
  subagent_depth: NonNegativeInt.annotate({
    description: "Maximum subagent nesting depth. Defaults to 1.",
  }).pipe(optional),
  location_idle_timeout: Schema.Union([Schema.DurationFromString, Schema.Literal(false)])
    .annotate({
      description:
        'How long a location can go without session activity before its services are unloaded. Running sessions and background jobs keep a location loaded. Set to false to never unload (default: "60 minutes")',
    })
    .pipe(optional),
  policies: ConfigPolicy.Info.pipe(Schema.Array)
    .annotate({
      description: "Deprecated: use top-level policies. Ordered policies controlling access to configured resources",
    })
    .pipe(optional),
}) {}
