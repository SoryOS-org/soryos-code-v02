import photonWasm from "#photon-wasm"
import { Effect } from "effect"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { FileSystem } from "../filesystem.js"
import { DecodeError, ResizerUnavailableError, SizeError, type Limits } from "../image.js"

const JPEG_QUALITIES = [80, 85, 70, 55, 40]

export const make = Effect.gen(function* () {
  const loadPhoton = yield* Effect.cached(
    // A runtime without a photon wasm artifact (#photon-wasm resolves to the
    // empty string on workerd) has no resizer, by declaration: fail typed
    // before touching URLs or module loading. The path resolution and import
    // for runtimes that DO have an artifact stay inside the guard too — a
    // throw outside it (workerd's undefined import.meta.url was one) is a
    // defect that escapes the ResizerUnavailableError handling and turns any
    // image-bearing prompt into a 500 instead of degrading to passthrough.
    photonWasm === ""
      ? Effect.fail(new ResizerUnavailableError())
      : Effect.tryPromise({
          try: async () => {
            ;(globalThis as typeof globalThis & { __OPENCODE_PHOTON_WASM_PATH?: string }).__OPENCODE_PHOTON_WASM_PATH =
              path.isAbsolute(photonWasm) ? photonWasm : fileURLToPath(new URL(photonWasm, import.meta.url))
            return await import("@silvia-odwyer/photon-node")
          },
          catch: () => new ResizerUnavailableError(),
        }),
  )
  return Effect.fn("Image.Photon.normalize")(function* (
    resource: string,
    content: FileSystem.Content & { readonly encoding: "base64" },
    limits: Readonly<Limits>,
  ) {
    const photon = yield* loadPhoton
    const input = Buffer.from(content.content, "base64")
    const orientation = jpegOrientation(input)
    const decoded = yield* Effect.try({
      try: () => {
        const image = photon.PhotonImage.new_from_byteslice(input)
        if (orientation === 1) return image
        try {
          const width = image.get_width()
          const height = image.get_height()
          return new photon.PhotonImage(
            orientPixels(image.get_raw_pixels(), width, height, orientation),
            orientation >= 5 ? height : width,
            orientation >= 5 ? width : height,
          )
        } finally {
          image.free()
        }
      },
      catch: () => new DecodeError({ resource }),
    })
    try {
      const width = decoded.get_width()
      const height = decoded.get_height()
      const bytes = Buffer.byteLength(content.content, "utf-8")
      const fits = width <= limits.maxWidth && height <= limits.maxHeight && bytes <= limits.maxBase64Bytes
      // Bake orientation into even small JPEGs: model providers need not honor EXIF.
      if (fits && orientation === 1) return content
      if (!fits && !limits.autoResize)
        return yield* new SizeError({
          resource,
          width,
          height,
          bytes,
          maxWidth: limits.maxWidth,
          maxHeight: limits.maxHeight,
          maxBytes: limits.maxBase64Bytes,
        })
      const scale = Math.min(1, limits.maxWidth / width, limits.maxHeight / height)
      const sizes = Array.from({ length: limits.autoResize ? 32 : 1 }).reduce<Array<{ width: number; height: number }>>(
        (acc) => {
          const previous = acc.at(-1) ?? {
            width: Math.max(1, Math.round(width * scale)),
            height: Math.max(1, Math.round(height * scale)),
          }
          const next =
            acc.length === 0
              ? previous
              : {
                  width: previous.width === 1 ? 1 : Math.max(1, Math.floor(previous.width * 0.75)),
                  height: previous.height === 1 ? 1 : Math.max(1, Math.floor(previous.height * 0.75)),
                }
          return acc.some((item) => item.width === next.width && item.height === next.height) ? acc : [...acc, next]
        },
        [],
      )
      for (const size of sizes) {
        const resized =
          size.width === width && size.height === height
            ? decoded
            : photon.resize(decoded, size.width, size.height, photon.SamplingFilter.Lanczos3)
        try {
          const encoders: Array<readonly [mime: string, encode: () => Uint8Array]> = [
            ["image/png", () => resized.get_bytes()],
            ...JPEG_QUALITIES.map((quality) => ["image/jpeg", () => resized.get_bytes_jpeg(quality)] as const),
          ]
          for (const [mime, encode] of encoders) {
            const candidate = encode()
            // Base64 uses four bytes per three input bytes, including padding.
            if (Math.ceil(candidate.length / 3) * 4 <= limits.maxBase64Bytes)
              return {
                ...content,
                content: Buffer.from(candidate).toString("base64"),
                encoding: "base64" as const,
                mime,
              }
          }
        } finally {
          if (resized !== decoded) resized.free()
        }
      }
      return yield* new SizeError({
        resource,
        width,
        height,
        bytes,
        maxWidth: limits.maxWidth,
        maxHeight: limits.maxHeight,
        maxBytes: limits.maxBase64Bytes,
      })
    } finally {
      decoded.free()
    }
  })
})

function jpegOrientation(input: Buffer) {
  if (input.length < 2 || input.readUInt16BE(0) !== 0xffd8) return 1
  let offset = 2
  while (offset < input.length) {
    if (input[offset++] !== 0xff) return 1
    while (input[offset] === 0xff) offset++
    const marker = input[offset++]
    // Metadata ends at the start of the compressed scan.
    if (marker === 0xda || marker === 0xd9) return 1
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue
    if (offset + 2 > input.length) return 1
    const length = input.readUInt16BE(offset)
    if (length < 2 || offset + length > input.length) return 1
    if (marker === 0xe1 && length >= 8 && input.toString("latin1", offset + 2, offset + 8) === "Exif\0\0") {
      return tiffOrientation(input.subarray(offset + 8, offset + length))
    }
    offset += length
  }
  return 1
}

function tiffOrientation(input: Buffer) {
  if (input.length < 8) return 1
  const order = input.readUInt16BE(0)
  if (order !== 0x4949 && order !== 0x4d4d) return 1
  const view = new DataView(input.buffer, input.byteOffset, input.byteLength)
  const little = order === 0x4949
  if (view.getUint16(2, little) !== 42) return 1
  const ifd = view.getUint32(4, little)
  if (ifd < 8 || ifd + 2 > input.length) return 1
  const count = view.getUint16(ifd, little)
  for (let i = 0; i < count; i++) {
    const entry = ifd + 2 + i * 12
    if (entry + 12 > input.length) return 1
    if (view.getUint16(entry, little) !== 0x0112) continue
    // Orientation is one inline SHORT in IFD0, not the thumbnail's IFD.
    if (view.getUint16(entry + 2, little) !== 3 || view.getUint32(entry + 4, little) !== 1) return 1
    const value = view.getUint16(entry + 8, little)
    return value >= 1 && value <= 8 ? value : 1
  }
  return 1
}

function orientPixels(input: Uint8Array, width: number, height: number, orientation: number) {
  // Integer pixel permutations avoid interpolation and preserve reflected text.
  const output = new Uint8Array(input.length)
  const flipX = orientation === 2 || orientation === 3 || orientation === 7 || orientation === 8
  const flipY = orientation === 3 || orientation === 4 || orientation === 6 || orientation === 7
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dx = flipX ? width - 1 - x : x
      const dy = flipY ? height - 1 - y : y
      const from = (y * width + x) * 4
      const to = (orientation >= 5 ? dx * height + dy : dy * width + dx) * 4
      output[to] = input[from]
      output[to + 1] = input[from + 1]
      output[to + 2] = input[from + 2]
      output[to + 3] = input[from + 3]
    }
  }
  return output
}
