import { Effect } from "effect"
import { execSync } from "node:child_process"
import { Octokit } from "@octokit/rest"
import { Commands } from "../../commands"
import { Runtime } from "../../../framework/runtime"
import { ServerConnection } from "../../../services/server-connection"
import { runNonInteractive } from "../../../run/run"

function git(cmd: string, cwd: string): string {
  return execSync(`git ${cmd}`, { cwd, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim()
}

export default Runtime.handler(Commands.commands.github.commands.run, (input) =>
  Effect.gen(function* () {
    const server = yield* ServerConnection.resolve({ standalone: input.standalone })
    const prompt = process.env["PROMPT"] || "Summarize this repository"
    yield* Effect.promise(() =>
      runNonInteractive({
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
      }),
    )

    yield* Effect.promise(async () => {
      const cwd = process.cwd()
      const status = git("status --porcelain", cwd)
      if (!status) return
      const token = process.env["GITHUB_TOKEN"] || process.env["TOKEN"]
      if (!token) {
        console.log("Working tree changed but no GITHUB_TOKEN/TOKEN provided; skipping PR creation")
        return
      }
      const remote = git("remote get-url origin", cwd)
      const match = remote.match(/github\.com[:/](.+?)\/(.+?)(?:\.git)?$/)
      if (!match) {
        console.log("Could not parse GitHub remote; skipping PR creation")
        return
      }
      const owner = match[1]
      const repo = match[2]
      const base = git("rev-parse --abbrev-ref HEAD", cwd)
      const branch = `opencode/run-${Date.now()}`
      git(`checkout -b ${branch}`, cwd)
      git("add -A", cwd)
      git('commit -m "opencode: automated changes"', cwd)
      git(`push -u origin ${branch}`, cwd)
      const octokit = new Octokit({ auth: token })
      const pr = await octokit.pulls.create({
        owner,
        repo,
        title: "opencode: automated changes",
        head: branch,
        base,
        body: "Automated changes produced by opencode github run.",
      })
      console.log(`Created PR #${pr.data.number}: ${pr.data.html_url}`)
    })
    void input
  }),
)