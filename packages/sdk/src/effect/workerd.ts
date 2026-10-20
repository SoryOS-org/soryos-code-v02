export * as LutungCodeWorkerd from "./workerd"

import { Layer } from "effect"
import type { Config, Scope } from "effect"
import { WorkerdProfile } from "../internal/workerd"
import { LutungCode } from "./lutungcode"

export type Configuration = WorkerdProfile.Configuration

export interface CreateOptions<R = never> extends WorkerdProfile.Options {
  readonly log?: LutungCode.CreateOptions["log"]
  readonly plugins?: LutungCode.CreateOptions["plugins"]
  readonly workspaceProviders?: LutungCode.CreateOptions["workspaceProviders"]
  readonly instances?: LutungCode.CreateOptions<R>["instances"]
}

export const create = <R = never>({ log, plugins, workspaceProviders, instances, ...options }: CreateOptions<R>) => {
  const profile = WorkerdProfile.make(options)
  return LutungCode.create(
    { ...profile.options, log, plugins, workspaceProviders, instances },
    { overrides: profile.replacements },
  )
}

export const layer = <R = never>(
  options: CreateOptions<R>,
): Layer.Layer<LutungCode.Service, Config.ConfigError | Error, Exclude<R, Scope.Scope>> =>
  Layer.effect(LutungCode.Service, create(options))

export type Interface = LutungCode.Interface
export type Requirements = Scope.Scope
