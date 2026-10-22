import { expect, test } from "bun:test"
import { revertUserMessage, type RevertUserMessageApi } from "../../../src/routes/session/undo"

function api(handlers: Partial<RevertUserMessageApi> & { calls?: string[] }): RevertUserMessageApi {
  const calls = handlers.calls ?? []
  return {
    cancel: async () => {
      calls.push("cancel")
      await handlers.cancel?.()
    },
    messageExists: async () => {
      calls.push("messageExists")
      return (await handlers.messageExists?.()) ?? false
    },
    interrupt: async () => {
      calls.push("interrupt")
      await handlers.interrupt?.()
    },
    wait: async () => {
      calls.push("wait")
      await handlers.wait?.()
    },
    stage: async () => {
      calls.push("stage")
      await handlers.stage?.()
    },
  }
}

test.each([
  {
    name: "projected",
    pending: false,
    exists: false,
    expected: ["interrupt", "wait", "stage"],
    result: "staged",
  },
  {
    name: "pending withdrawn",
    pending: true,
    exists: false,
    expected: ["cancel", "messageExists"],
    result: "cancelled",
  },
  {
    name: "pending promoted race",
    pending: true,
    exists: true,
    expected: ["cancel", "messageExists", "interrupt", "wait", "stage"],
    result: "staged",
  },
])("revertUserMessage routes $name messages", async ({ pending, exists, expected, result }) => {
  const calls: string[] = []
  const outcome = await revertUserMessage({
    pending,
    api: api({
      calls,
      messageExists: async () => exists,
    }),
  })

  expect(calls).toEqual([...expected])
  expect(outcome).toBe(result)
})

test("revertUserMessage surfaces cancel failures without staging", async () => {
  const calls: string[] = []
  await expect(
    revertUserMessage({
      pending: true,
      api: api({
        calls,
        cancel: async () => {
          throw new Error("offline")
        },
      }),
    }),
  ).rejects.toMatchObject({ message: "offline" })
  expect(calls).toEqual(["cancel"])
})

test("revertUserMessage surfaces stage failures after a promotion race", async () => {
  const calls: string[] = []
  await expect(
    revertUserMessage({
      pending: true,
      api: api({
        calls,
        messageExists: async () => true,
        stage: async () => {
          throw new Error("Message not found")
        },
      }),
    }),
  ).rejects.toMatchObject({ message: "Message not found" })
  expect(calls).toEqual(["cancel", "messageExists", "interrupt", "wait", "stage"])
})
