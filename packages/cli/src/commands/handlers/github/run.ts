import { Effect, Option } from "effect"
import { execFileSync } from "node:child_process"
import { Octokit } from "@octokit/rest"
import * as core from "@actions/core"
import * as github from "@actions/github"
import { Commands } from "../../commands"
import { Runtime } from "../../../framework/runtime"
import { ServerConnection } from "../../../services/server-connection"
import { runNonInteractive } from "../../../run/run"

function git(args: string[], cwd: string): string {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim()
}

export default Runtime.handler(Commands.commands.github.commands.run, (input) =>
  Effect.gen(function* () {
    const server = yield* ServerConnection.resolve({ standalone: input.standalone })
    const eventStr = Option.getOrUndefined(input.event)
    const ctx: any = eventStr ? JSON.parse(eventStr) : github.context
    const token = yield* Effect.promise(async () => {
      const t = Option.getOrUndefined(input.token) || process.env["GITHUB_TOKEN"] || process.env["TOKEN"]
      if (t) return t
      if (process.env["USE_GITHUB_TOKEN"] === "true") {
        const gt = process.env["GITHUB_TOKEN"]
        if (!gt) throw new Error("GITHUB_TOKEN required")
        return gt
      }
      try {
        const oidcBaseUrl = (process.env["OIDC_BASE_URL"] || "https://api.opencode.ai").replace(/\/+$/, "")
        const oidcToken = await core.getIDToken("opencode-github-action")
        const res = await fetch(`${oidcBaseUrl}/exchange_github_app_token`, {
          method: "POST",
          headers: { Authorization: `Bearer ${oidcToken}` },
        })
        if (!res.ok) throw new Error(`token exchange failed: ${res.status}`)
        const data = (await res.json()) as { token: string }
        return data.token
      } catch (e) {
        console.error("OIDC token exchange failed:", e)
        return undefined
      }
    })

    const eventName = ctx?.eventName || process.env["GITHUB_EVENT_NAME"] || ""
    const isRepoEvent = eventName === "schedule" || eventName === "workflow_dispatch"
    const issueNumber = ctx?.payload?.issue?.number ?? ctx?.payload?.pull_request?.number ?? ctx?.issue?.number
    const prPayload = ctx?.payload?.pull_request ?? (ctx?.payload?.issue?.pull_request ? ctx?.payload?.issue : null)
    const isFork = !!prPayload?.head?.repo && (prPayload.head.repo.full_name !== (prPayload.base?.repo?.full_name ?? prPayload.base?.repo?.full_name))
    const commentId = ctx?.payload?.comment?.id
    const owner = ctx?.repo?.owner ?? ctx?.repository?.owner?.login
    const repo = ctx?.repo?.repo ?? ctx?.repository?.name
    const actor = ctx?.actor

    // Require PROMPT for repo events
    if (isRepoEvent && !process.env["PROMPT"]) {
      console.error("PROMPT is required for schedule and workflow_dispatch events")
      process.exitCode = 1
      return
    }

    // Permission check (user events only)
    if (token && issueNumber && actor && !isRepoEvent) {
      yield* Effect.promise(async () => {
        const octokit = new Octokit({ auth: token })
        try {
          const perm = await octokit.repos.getCollaboratorPermissionLevel({ owner, repo, username: actor })
          if (!["admin", "write"].includes(perm.data.permission)) {
            throw new Error(`User ${actor} does not have write permissions`)
          }
        } catch (e: any) {
          console.error(e?.message || e)
          process.exitCode = 1
          throw e
        }
      })
    }

    // Add reaction
    if (token && commentId && !isRepoEvent) {
      yield* Effect.promise(async () => {
        const octokit = new Octokit({ auth: token })
        try {
          await octokit.reactions.createForIssueComment({ owner, repo, comment_id: commentId, content: "eyes" })
        } catch {}
      })
    }

    // Resolve prompt: from comment body or env
    const commentBody: string = ctx?.payload?.comment?.body?.trim() || ""
    const mentions = (process.env["MENTIONS"] || "/opencode,/oc").split(",").map((m) => m.trim().toLowerCase()).filter(Boolean)
    let prompt = process.env["PROMPT"] || ""
    if (!prompt && !isRepoEvent) {
      if (mentions.some((m) => commentBody.toLowerCase() === m)) {
        prompt = "Summarize this thread"
      } else if (mentions.some((m) => commentBody.toLowerCase().includes(m))) {
        prompt = commentBody
      } else if (commentBody) {
        prompt = commentBody
      }
    }
    if (!prompt) prompt = "Summarize this repository"

    const cwd = process.cwd()

    // Checkout PR branch if applicable
    if (prPayload?.head?.ref) {
      yield* Effect.promise(async () => {
        try {
          if (isFork && prPayload.head.repo?.full_name) {
            git(["remote", "add", "fork", `https://github.com/${prPayload.head.repo.full_name}.git`], cwd)
            git(["fetch", "fork", prPayload.head.ref], cwd)
            git(["checkout", "-B", `pr-${issueNumber}`, `fork/${prPayload.head.ref}`], cwd)
          } else {
            git(["fetch", "origin", prPayload.head.ref], cwd)
            git(["checkout", prPayload.head.ref], cwd)
          }
        } catch {}
      })
    }

    // Run the prompt (capture stdout for the reply)
    const captured: string[] = []
    const origWrite = process.stdout.write.bind(process.stdout)
    process.stdout.write = ((chunk: any, ...args: any[]) => {
      captured.push(String(chunk))
      return origWrite(chunk, ...args)
    }) as any
    yield* Effect.promise(async () => {
      await runNonInteractive({
        server,
        message: [prompt],
        continue: false,
        session: undefined,
        fork: false,
        model: process.env["MODEL"],
        agent: process.env["AGENT"] || undefined,
        format: "default",
        file: [],
        title: undefined,
        thinking: false,
        auto: true,
      })
    })
    process.stdout.write = origWrite
    const responseText = captured.join("").trim()

    // Post the model's answer as a comment
    yield* Effect.promise(async () => {
      if (!token || !issueNumber) return
      const octokit = new Octokit({ auth: token })
      try {
        await octokit.issues.createComment({ owner, repo, issue_number: issueNumber, body: responseText || "opencode run completed." })
      } catch {}
    })

    // Remove reaction
    yield* Effect.promise(async () => {
      if (!token || !commentId || isRepoEvent) return
      const octokit = new Octokit({ auth: token })
      try {
        const reactions = await octokit.reactions.listForIssueComment({ owner, repo, comment_id: commentId, content: "eyes" })
        const eyes = reactions.data.find((r: any) => r.user?.login === "opencode-agent[bot]")
        if (eyes) {
          await octokit.reactions.deleteForIssueComment({ owner, repo, comment_id: commentId, reaction_id: eyes.id })
        }
      } catch {}
    })

    // Post-prompt git: commit and push if dirty
    yield* Effect.promise(async () => {
      const status = git(["status", "--porcelain"], cwd)
      if (!status) return
      const pushToken = token
      if (!pushToken) {
        console.log("Working tree changed but no token provided; skipping PR creation")
        return
      }
      const base = git(["rev-parse", "--abbrev-ref", "HEAD"], cwd)
      const branch = `opencode/run-${Date.now()}`
      git(["checkout", "-b", branch], cwd)
      git(["add", "-A"], cwd)
      git(["commit", "-m", "opencode: automated changes"], cwd)
      const octokit = new Octokit({ auth: pushToken })
      if (isFork && prPayload) {
        const forkRepo = prPayload.head.repo.full_name
        const headRef = prPayload.head.ref
        git(["remote", "add", "fork", `https://github.com/${forkRepo}.git`], cwd)
        git(["push", "fork", `HEAD:${headRef}`], cwd)
        try {
          await octokit.issues.createComment({ owner, repo, issue_number: issueNumber, body: "opencode pushed changes to the PR branch." })
        } catch {}
      } else if (prPayload) {
        // Existing PR: push to its branch (already checked out), no new PR
        git(["push", "origin", `HEAD:${prPayload.head.ref}`], cwd)
      } else {
        git(["push", "-u", "origin", branch], cwd)
        try {
          const pr = await octokit.pulls.create({ owner, repo, title: "opencode: automated changes", head: branch, base, body: "Automated changes produced by opencode github run." })
          console.log(`Created PR #${pr.data.number}: ${pr.data.html_url}`)
        } catch (e: any) {
          console.log(`PR creation failed: ${e?.message || e}`)
        }
      }
    })

    void input
  }),
)