import { describe, expect, test } from "bun:test"
import { Effect } from "effect"
import { Tool } from "../src/index.js"
import { ToolRuntime } from "../src/tool-runtime.js"

const tool = (description: string) =>
  Tool.make({ description, input: { type: "object", properties: {} }, execute: () => Effect.void })

const paths = async (runtime: ToolRuntime.ToolRuntime, query: string, namespace?: string) => {
  const result = (await Effect.runPromise(
    runtime.search([{ query, ...(namespace === undefined ? {} : { namespace }) }]),
  )) as {
    items: Array<{ path: string }>
  }
  return result.items.map((item) => item.path)
}

describe("tool search relevance", () => {
  test("partial and singular path words outrank incidental description matches", async () => {
    const prepared = ToolRuntime.prepare({
      slack: {
        list_channels: tool("List public channels"),
        post_message: tool("Post a message to a channel"),
      },
      github: {
        list_repositories: tool("List repositories for a user"),
        search_code: tool("Search code in a repo"),
      },
      cloudflare: {
        zones: tool("List configured zones"),
        timezones: tool("List supported timezones"),
        dns_records: tool("List records in a zone"),
      },
    })
    const runtime = ToolRuntime.make(prepared, undefined)
    for (const query of ["channel", "channels", "chan"])
      expect((await paths(runtime, query))[0]).toBe("tools.slack.list_channels")
    for (const query of ["repo", "repos", "repositor"])
      expect((await paths(runtime, query))[0]).toBe("tools.github.list_repositories")
    for (const query of ["zone", "zones", "zon"])
      expect((await paths(runtime, query))[0]).toBe("tools.cloudflare.zones")
  })

  test("a discriminating capability outranks a common action name", async () => {
    const prepared = ToolRuntime.prepare({
      directory: {
        search: tool("Search documents"),
        projects: tool("Search projects"),
        issues: tool("Search issues"),
        commits: tool("Search commits"),
        accounts: tool("Search accounts"),
        teams: tool("Search teams"),
        employees: tool("Search payroll records for an employee"),
      },
    })
    const runtime = ToolRuntime.make(prepared, undefined)
    expect((await paths(runtime, "search payroll"))[0]).toBe("tools.directory.employees")
  })

  test("focused descriptions outrank incidental mentions in broad descriptions", async () => {
    const prepared = ToolRuntime.prepare({
      billing: {
        export: tool(
          "Export a comprehensive account report, including contacts, activity, subscriptions, notifications, " +
            "settings, invoices, preferences, permissions, integrations, addresses, payment methods, " +
            "organization membership, audit history, comments, custom fields, tags, usage, and support requests.",
        ),
        list: tool("List account invoices"),
      },
    })
    const runtime = ToolRuntime.make(prepared, undefined)
    expect((await paths(runtime, "account invoices"))[0]).toBe("tools.billing.list")
  })

  test("scoped search recomputes relevance using only that namespace", async () => {
    const prepared = ToolRuntime.prepare({
      contacts: {
        search: tool("Search contact records"),
        lookup: tool("Find a contact by email address"),
      },
      mail: {
        search: tool("Search email messages"),
        lookup: tool("Find a message by its identifier"),
      },
    })
    const runtime = ToolRuntime.make(prepared, undefined)
    await paths(runtime, "email address")
    expect(await paths(runtime, "email address", "contacts")).toEqual(["tools.contacts.lookup"])
    expect(await paths(runtime, "email address", "mail")).toEqual(["tools.mail.search"])
  })

  test("empty and punctuation-only queries sort even a reordered prepared index", async () => {
    const prepared = ToolRuntime.prepare({ zebra: tool("Last"), alpha: tool("First"), middle: tool("Middle") })
    const runtime = ToolRuntime.make({ ...prepared, searchIndex: [...prepared.searchIndex].reverse() }, undefined)
    for (const query of ["", "   ", "***"]) {
      expect(await paths(runtime, query)).toEqual(["tools.alpha", "tools.middle", "tools.zebra"])
    }
  })
})
