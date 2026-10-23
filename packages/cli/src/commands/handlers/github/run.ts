import { Effect, Option } from "effect"
import { execFileSync } from "node:child_process"
import { Octokit } from "@octokit/rest"
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
    const token = Option.getOrUndefined(input.token) || process.env["GITHUB_TOKEN"] || process.env["TOKEN"]

    const eventName = ctx?.eventName || process.env["GITHUB_EVENT_NAME"] || ""
    const isRepoEvent = eventName === "schedule" || eventName === "workflow_dispatch"
    const issueNumber = ctx?.payload?.issue?.number ?? ctx?.payload?.pull_request?.number ?? ctx?.issue?.number
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

    // Run the prompt
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

    // Post-completion comment
    yield* Effect.promise(async () => {
      if (!token || !issueNumber) return
      const octokit = new Octokit({ auth: token })
      try {
        await octokit.issues.createComment({ owner, repo, issue_number: issueNumber, body: "opencode run completed." })
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
      const isFork = !!(ctx?.payload?.pull_request) && (ctx?.payload?.pull_request?.head?.repo?.full_name !== ctx?.payload?.pull_request?.base?.repo?.full_name)
      const base = git(["rev-parse", "--abbrev-ref", "HEAD"], cwd)
      const branch = `opencode/run-${Date.now()}`
      git(["checkout", "-b", branch], cwd)
      git(["add", "-A"], cwd)
      git(["commit", "-m", "opencode: automated changes"], cwd)
      const octokit = new Octokit({ auth: pushToken })
      if (isFork) {
        const forkRepo = ctx.payload.pull_request.head.repo.full_name
        git(["remote", "add", "fork", `https://github.com/${forkRepo}.git`], cwd)
        git(["push", "fork", `HEAD:${ctx.payload.pull_request.head.ref}`], cwd)
        try {
          await octokit.issues.createComment({ owner, repo, issue_number: issueNumber, body: "opencode pushed changes to the PR branch." })
        } catch {}
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