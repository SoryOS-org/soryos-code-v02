# OpenCode local tools

This directory contains project-local OpenCode configuration and tools. Its
installed SDK dependency is `@opencode-ai/plugin` 1.18.3. The GitHub tools use
the legacy tool helper exported by `@opencode-ai/plugin/tool`.

The monorepo's workspace package `@opencode/plugin` is a different SDK surface
and does not provide this `tool` export. Keep these project tools bound to the
installed SDK import; changing it to the workspace package prevents OpenCode
from loading the tools.

Run the offline tool contract regression checks from this directory with:

```sh
bun test ./test/tool-sdk.test.ts
```

The checks load both tools, validate their argument schemas and defaults, and
convert the schemas to JSON Schema. They do not call the tools' `execute`
functions or contact GitHub.
