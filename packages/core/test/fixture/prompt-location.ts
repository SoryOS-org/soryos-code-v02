import type { FileSystem } from "@lutungcode/core/filesystem"
import { Bus } from "@lutungcode/core/bus"
import { Image } from "@lutungcode/core/image"
import { LocationServiceMap } from "@lutungcode/core/location-service-map"
import type { LocationServices } from "@lutungcode/core/location-services"
import { Plugin } from "@lutungcode/core/plugin"
import { PluginHooks } from "@lutungcode/core/plugin/hooks"
import { Skill } from "@lutungcode/core/skill"
import type { Location } from "@lutungcode/schema/location"
import { makeGlobalNode } from "@lutungcode/util/effect/app-node"
import { LayerNode } from "@lutungcode/util/effect/layer-node"
import { Effect, Layer, LayerMap } from "effect"

// Plain-prompt unit fixtures use virtual directories.
export const promptLocationNode = makeGlobalNode({
  service: LocationServiceMap.Service,
  layer: Layer.effect(
    LocationServiceMap.Service,
    Effect.gen(function* () {
      const bus = yield* Bus.Service
      return yield* LayerMap.make(
        (_ref: Location.Ref) =>
          LayerNode.compile(LayerNode.group([PluginHooks.node, Image.node, Skill.node, Plugin.node]), {
            replacements: [
              Bus.node.replace(Layer.succeed(Bus.Service, bus)),
              Plugin.node.replace(Layer.mock(Plugin.Service, { awaitActivation: Effect.void })),
            ],
          }) as unknown as Layer.Layer<LocationServices, FileSystem.DirectoryNotFoundError>,
      )
    }),
  ),
  deps: [Bus.node],
})
