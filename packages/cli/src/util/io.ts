import { text } from "node:stream/consumers"

export function readStdin() {
  return text(process.stdin)
}

// `process.stdout.write` only queues the payload; the CLI exits right after a
// command runs, so a write larger than the pipe buffer is dropped unless it is
// awaited. EPIPE means the consumer closed the pipe (`| head`), which is not an
// error for us.
export function writeStdout(value: string) {
  return new Promise<void>((resolve, reject) => {
    process.stdout.write(value, (error) => {
      if (!error) return resolve()
      if ("code" in error && error.code === "EPIPE") return resolve()
      reject(error)
    })
  })
}
