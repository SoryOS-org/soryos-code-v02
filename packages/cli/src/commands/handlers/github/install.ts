import { Effect } from "effect"
import { mkdirSync, writeFileSync, existsSync } from "node:fs"
import { join } from "node:path"
import { execSync } from "node:child_process"
import { Commands } from "../../commands"
import { Runtime } from "../../../framework/runtime"

function parseRemote(url: string): { owner: string; repo: string } | null {
  const m = url.match(/github\.com[:/](.+?)\/(.+?)(?:\.git)?$/)
  if (!m) return null
  return { owner: m[1], repo: m[2] }
}

export default Runtime.handler(Commands.commands.github.commands.install, () =>
  Effect.sync(() => {
    const cwd = process.cwd()
    let remoteUrl = ""
    try {
      remoteUrl = execSync("git remote get-url origin", { cwd, encoding: "utf8" }).trim()
    } catch {
      console.error("Could not find git repository. Please run this command from a git repository.")
      process.exitCode = 1
      return
    }
    const parsed = parseRemote(remoteUrl)
    if (!parsed) {
      console.error("Could not parse GitHub remote.")
      process.exitCode = 1
      return
    }

    const workflowDir = join(cwd, ".github", "workflows")
    if (!existsSync(workflowDir)) mkdirSync(workflowDir, { recursive: true })
    const workflowPath = join(workflowDir, "opencode.yml")
    const content = `name: opencode

on:
  issue_comment:
    types: [created]
  pull_request_review_comment:
    types: [created]

jobs:
  opencode:
    if: |
      contains(github.event.comment.body, ' /oc') ||
      startsWith(github.event.comment.body, '/oc') ||
      contains(github.event.comment.body, ' /opencode') ||
      startsWith(github.event.comment.body, '/opencode')
    runs-on: ubuntu-latest
    permissions:
      id-token: write
      contents: read
      pull-requests: read
      issues: read
    steps:
      - name: Checkout repository
        uses: actions/checkout@v6
        with:
          persist-credentials: false

      - name: Run opencode
        uses: anomalyco/opencode/github@latest
        env:
          ANTHROPIC_API_KEY: \${{ secrets.ANTHROPIC_API_KEY }}
        with:
          model: anthropic/claude-sonnet-4-20250514
`
    writeFileSync(workflowPath, content)
    console.log(`Added workflow file: "${workflowPath}"`)
    console.log("")
    console.log("Next steps:")
    console.log("  1. Commit the workflow file and push")
    console.log("  2. Add your provider API key as a repository secret")
    console.log("  3. Install the GitHub app: https://github.com/apps/opencode-agent")
    console.log(`  4. Comment '/oc' on an issue in ${parsed.owner}/${parsed.repo} to try it`)
  }),
)