export const available = true

export async function resolveBinary() {
  return process.env.LUTUNGCODE_PTY_BIN || "lutungcode-pty"
}
