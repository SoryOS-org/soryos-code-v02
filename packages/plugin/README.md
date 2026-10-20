# `@lutungcode/plugin`

Authoring interfaces and runtime loader support for LutungCode V2 plugins:

- `@lutungcode/plugin` — [Promise plugin API](./src/README.md)
- `@lutungcode/plugin/effect` — [Effect plugin API](./src/effect/README.md)
- `@lutungcode/plugin/rpc` — portable RPC contract definitions
- `@lutungcode/plugin/tui` — terminal UI plugin API

## Packaging And Runtime `effect`

When the LutungCode CLI loads server or TUI plugins, it resolves imports of `effect`, exported `effect/*` subpaths, and `@lutungcode/plugin` entrypoints (including imports from dependencies inside a plugin's `node_modules`) to the host's runtime module instances so fibers, loggers, and `Schema` parsers share one copy.

- Declare `"effect": "^4.0.0"` as a `peerDependency` (and `devDependency` for local type-checking and testing) rather than a bundled runtime dependency.
- Do not bundle `effect` into published plugin files; if you build with a bundler, keep `effect` and `effect/*` external. Two copies of `effect` do not share fiber, logger, or `Schema` internals.
- Plugins and their `node_modules` dependencies always receive LutungCode's host `effect` instance. Use `effect` APIs and module paths compatible with the LutungCode release you target; dependencies built on another `effect` major (such as Effect 3) are not supported.
- Only public `effect` subpaths are provided. A plugin that imports one of Effect's private `internal` modules fails to load with an error naming the path.
- The compiled LutungCode binary does not include the Scalar and Swagger UI assets used by Effect's HTTP API docs pages; serving those pages from a plugin shows a notice instead.
