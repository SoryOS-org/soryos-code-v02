// Speaks raw JSON-RPC: the MCP server SDK would wrap an outputSchema that has no top-level "type".
const send = (message: unknown) => process.stdout.write(JSON.stringify(message) + "\n")
const callers = {
  $defs: {
    Callers: { type: "object", properties: { callers: { type: "array" } }, required: ["callers"] },
    Kind: { type: "object", properties: { kind: { type: "string" } }, required: ["kind"] },
  },
  anyOf: [{ $ref: "#/$defs/Callers" }, { $ref: "#/$defs/Kind" }],
}

let buffer = ""
process.stdin.on("data", (chunk) => {
  buffer += chunk
  for (let end = buffer.indexOf("\n"); end >= 0; end = buffer.indexOf("\n")) {
    const message = JSON.parse(buffer.slice(0, end))
    buffer = buffer.slice(end + 1)
    if (message.id === undefined) continue
    if (message.method === "initialize")
      send({
        jsonrpc: "2.0",
        id: message.id,
        result: {
          protocolVersion: message.params.protocolVersion,
          capabilities: { tools: {} },
          serverInfo: { name: "anyof-output", version: "1.0.0" },
        },
      })
    else if (message.method === "tools/list")
      send({
        jsonrpc: "2.0",
        id: message.id,
        result: {
          tools: [
            { name: "plain", inputSchema: { type: "object" }, outputSchema: { type: "object" } },
            { name: "callers", inputSchema: { type: "object" }, outputSchema: callers },
          ],
        },
      })
    else if (message.method === "tools/call")
      send({ jsonrpc: "2.0", id: message.id, result: { content: [], structuredContent: { kind: "fallback" } } })
    else send({ jsonrpc: "2.0", id: message.id, error: { code: -32601, message: "Method not found" } })
  }
})
