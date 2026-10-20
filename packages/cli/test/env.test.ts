import { expect, test } from "bun:test"
import { Env } from "../src/env"

test("session environment omits server credentials", () => {
  const previousPassword = process.env.LUTUNGCODE_PASSWORD
  const previousLegacyPassword = process.env.LUTUNGCODE_SERVER_PASSWORD
  const previousValue = process.env.LUTUNGCODE_SESSION_ENV_TEST
  process.env.LUTUNGCODE_PASSWORD = "password"
  process.env.LUTUNGCODE_SERVER_PASSWORD = "legacy"
  process.env.LUTUNGCODE_SESSION_ENV_TEST = "included"

  const environment = Env.session()

  if (previousPassword === undefined) delete process.env.LUTUNGCODE_PASSWORD
  else process.env.LUTUNGCODE_PASSWORD = previousPassword
  if (previousLegacyPassword === undefined) delete process.env.LUTUNGCODE_SERVER_PASSWORD
  else process.env.LUTUNGCODE_SERVER_PASSWORD = previousLegacyPassword
  if (previousValue === undefined) delete process.env.LUTUNGCODE_SESSION_ENV_TEST
  else process.env.LUTUNGCODE_SESSION_ENV_TEST = previousValue

  expect(environment.LUTUNGCODE_PASSWORD).toBeUndefined()
  expect(environment.LUTUNGCODE_SERVER_PASSWORD).toBeUndefined()
  expect(environment.LUTUNGCODE_SESSION_ENV_TEST).toBe("included")
})
