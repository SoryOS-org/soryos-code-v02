import { expect, test } from "@playwright/test"
import type { SessionMessageUser } from "@opencode/client/promise"
import { Option, Schema } from "effect"
import { timelinePresets } from "@opencode/session-ui/timeline/detail"
import { holdRoute } from "../utils/app"
import {
  assistantMessage,
  inboxEnqueued,
  partUpdated,
  revertCommitted,
  revertStaged,
  sessionID,
  setupTimeline,
  toolPart,
  userMessage,
} from "../utils/timeline"

test("keeps shell and question failures in their Used group", async ({ page }) => {
  const shellID = "prt_transition_error_shell"
  const questionID = "prt_transition_error_question"

  const timeline = await setupTimeline(page, {
    settings: { timelineDetail: timelinePresets[2].value },
    messages: [
      userMessage(),
      assistantMessage(
        [
          toolPart(shellID, "shell", "streaming", { command: "exit 1" }),
          toolPart(questionID, "question", "streaming", questionInput()),
        ],
        { completed: false },
      ),
    ],
  })

  const group = page.locator('[data-component="collapsed-tool-group"]')
  const used = group.locator(':scope > [data-component="collapsible"] > [data-slot="collapsible-trigger"]')
  await used.click()
  await expect(page.locator(`[data-timeline-part-id="${questionID}"]`)).toHaveCount(0)
  await timeline.send(partUpdated(toolPart(shellID, "shell", "running", { command: "exit 1" })))
  await expect(page.locator(`[data-timeline-part-id="${shellID}"]`)).toContainText("exit 1")
  await timeline.send(partUpdated(toolPart(questionID, "question", "running", questionInput())))
  await expect(page.locator(`[data-timeline-part-id="${questionID}"]`)).toHaveCount(0)
  await timeline.send(
    partUpdated(
      toolPart(
        shellID,
        "shell",
        "completed",
        { command: "exit 1" },
        { output: "Command exited 1", metadata: { exit: 1 } },
      ),
    ),
  )
  await timeline.send(
    partUpdated(
      toolPart(questionID, "question", "error", questionInput(), { error: "The user dismissed this question" }),
    ),
  )

  await expect(group).toHaveAttribute("data-timeline-part-ids", `${shellID},${questionID}`)
  await expect(used).toHaveAttribute("aria-expanded", "true")
  const shell = group.locator(`[data-timeline-part-id="${shellID}"]`)
  await expect(shell.locator('[data-slot="collapsible-trigger"]')).toHaveAttribute("aria-expanded", "false")
  await shell.locator('[data-slot="collapsible-trigger"]').click()
  await expect(shell).toContainText("Command exited 1")
  const question = group.locator(`[data-timeline-part-id="${questionID}"]`)
  await expect(question).toContainText(/dismissed/i)
})

function questionInput() {
  return { questions: [{ header: "Stability", question: "Keep it stable?", options: [] }] }
}

const decodeReplyMetadata = Schema.decodeUnknownOption(
  Schema.Struct({
    genuiReply: Schema.Struct({
      callID: Schema.String,
      fields: Schema.Record(Schema.String, Schema.Union([Schema.String, Schema.Boolean])),
    }),
  }),
)

test("sends a generated form once, keeps it submitted after a reload, and reopens it when the reply is reverted", async ({ page }) => {
  const callID = "call_genui_decisions"

  const code = [
    "root = Surface([form])",
    "form = Form([scope], actions)",
    'scope = Choice("scope", "Scope", ["A", "B", "C"], "A")',
    "actions = Actions([submit])",
    'submit = Button("Submit decisions", "Here are my decisions", "primary")',
  ].join("\n")

  const seeded = [
    userMessage(),
    assistantMessage([toolPart(callID, "genui_render", "completed", { title: "Decisions", code })]),
  ]

  const replies: SessionMessageUser[] = []

  const timeline = await setupTimeline(page, {
    messages: seeded,
    pageMessages: () => ({ items: [...seeded, ...replies] }),
    onPrompt: ({ body }) => {
      replies.push({
        id: String(body.id),
        type: "user",
        time: { created: 1700000002000 + replies.length },
        text: String(body.text),
        metadata: Option.getOrUndefined(decodeReplyMetadata(body.metadata)),
      })
    },
  })

  const form = page.locator('[data-component="genui-form"]')
  const submit = form.getByRole("button", { name: "Submit decisions" })
  await form.getByText("B", { exact: true }).click()
  const sent = page.waitForResponse(/\/api\/session\/[^/]+\/prompt/)
  await submit.click()
  await sent

  await expect(submit).toBeDisabled()
  await expect(form.getByText("Submitted", { exact: true })).toBeVisible()
  await expect(form.getByRole("radio", { name: "B" })).toBeChecked()
  await expect(form.getByRole("radio", { name: "A" })).toBeDisabled()

  await page.reload()
  await expect(form.getByText("Submitted", { exact: true })).toBeVisible()
  await expect(submit).toBeDisabled()
  await expect(form.getByRole("radio", { name: "B" })).toBeChecked()
  expect(replies.map((reply) => reply.metadata?.genuiReply)).toEqual([{ callID, fields: { scope: "B" } }])

  // Reverting the reply reopens the form; sending again commits the revert first, then sends once.
  const reply = replies[0]!

  await timeline.transport.waitForConnection()
  await timeline.send(revertStaged({ sessionID, revert: { messageID: reply.id } }))
  await expect(submit).toBeEnabled()
  await expect(form.getByText("Submitted", { exact: true })).toHaveCount(0)

  const commit = await holdRoute(page, /\/api\/session\/[^/]+\/revert\/commit/, { method: "POST" })
  const resent = page.waitForResponse(/\/api\/session\/[^/]+\/prompt/)

  await submit.click()
  await commit.arrived
  expect(replies).toHaveLength(1)
  await timeline.send(revertCommitted({ sessionID, to: reply.id }))
  commit.release()
  await resent

  // The server's admission echo, which restores the row the committed echo may have dropped.
  const resend = replies[1]!

  await timeline.send(
    inboxEnqueued({
      sessionID,
      inboxID: resend.id,
      item: { type: "user", payload: { text: resend.text, metadata: resend.metadata }, delivery: "steer" },
    }),
  )

  await expect(submit).toBeDisabled()
  await expect(form.getByText("Submitted", { exact: true })).toBeVisible()
  expect(replies.map((item) => item.id)).toEqual([reply.id, resend.id])
  expect(commit.requests).toHaveLength(1)
})
