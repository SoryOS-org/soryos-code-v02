import { describe, expect } from "bun:test"
import { AppNodeBuilder } from "@opencode/core/effect/app-node-builder"
import { Image } from "@opencode/core/image"
import { PhotonImage } from "@silvia-odwyer/photon-node"
import { Effect } from "effect"
import { testEffect } from "./lib/effect"

const it = testEffect(AppNodeBuilder.build(Image.node))
const colors = [
  [240, 30, 30],
  [30, 220, 30],
  [30, 30, 240],
  [240, 220, 30],
  [220, 30, 220],
  [30, 220, 220],
]

// Six distinct tiles and an off-center F make rotations and reflections visible.
const pixels = Uint8Array.from({ length: 96 * 64 * 4 }, (_, i) => {
  const x = Math.floor(i / 4) % 96
  const y = Math.floor(i / 4 / 96)
  if (i % 4 === 3) return 255
  if (x >= 4 && x < 8 && y >= 4 && y < 24) return 0
  if (x >= 4 && x < 20 && y >= 4 && y < 8) return 0
  if (x >= 4 && x < 16 && y >= 12 && y < 16) return 0
  return colors[Math.floor(y / 32) * 3 + Math.floor(x / 32)][i % 4] + ((x * 17 + y * 31) % 9) - 4
})
const source = new PhotonImage(pixels, 96, 64)
const jpeg = Buffer.from(source.get_bytes_jpeg(95))
const png = Buffer.from(source.get_bytes())
source.free()

function content(bytes: Uint8Array, mime = "image/jpeg") {
  return {
    uri: "file:///asymmetric.jpg",
    name: "asymmetric.jpg",
    content: Buffer.from(bytes).toString("base64"),
    encoding: "base64" as const,
    mime,
  }
}

function exif(orientation: number, little: boolean) {
  // APP1 with a non-default IFD0 offset and an unrelated entry before Orientation.
  const segment = Buffer.alloc(52)
  segment.set([0xff, 0xe1, 0, 50, 0x45, 0x78, 0x69, 0x66, 0, 0])
  const tiff = new DataView(segment.buffer, segment.byteOffset + 10, 42)
  tiff.setUint16(0, little ? 0x4949 : 0x4d4d)
  tiff.setUint16(2, 42, little)
  tiff.setUint32(4, 12, little)
  tiff.setUint16(12, 2, little)
  tiff.setUint16(14, 0x100, little)
  tiff.setUint16(16, 4, little)
  tiff.setUint32(18, 1, little)
  tiff.setUint32(22, 96, little)
  tiff.setUint16(26, 0x112, little)
  tiff.setUint16(28, 3, little)
  tiff.setUint32(30, 1, little)
  tiff.setUint16(34, orientation, little)
  return segment
}

function tagged(orientation: number, little: boolean, jpegBytes = jpeg) {
  return content(Buffer.concat([jpegBytes.subarray(0, 2), exif(orientation, little), jpegBytes.subarray(2)]))
}

// Expected tile order, written independently of the implementation's pixel mapping.
const cases = [
  [1, [0, 1, 2, 3, 4, 5]],
  [2, [2, 1, 0, 5, 4, 3]],
  [3, [5, 4, 3, 2, 1, 0]],
  [4, [3, 4, 5, 0, 1, 2]],
  [5, [0, 3, 1, 4, 2, 5]],
  [6, [3, 0, 4, 1, 5, 2]],
  [7, [5, 2, 4, 1, 3, 0]],
  [8, [2, 5, 1, 4, 0, 3]],
] as const

function expectPixels(base64: string, orientation: number, order: readonly number[], small: boolean) {
  const image = PhotonImage.new_from_byteslice(Buffer.from(base64, "base64"))
  try {
    const columns = orientation >= 5 ? 2 : 3
    const rows = orientation >= 5 ? 3 : 2
    const tile = small ? 16 : 32
    expect(image.get_width()).toBe(columns * tile)
    expect(image.get_height()).toBe(rows * tile)
    const actual = image.get_raw_pixels()
    order.forEach((color, i) => {
      const x = (i % columns) * tile + Math.floor(tile * 0.65)
      const y = Math.floor(i / columns) * tile + Math.floor(tile * 0.65)
      colors[color].forEach((channel, c) => {
        expect(Math.abs(actual[(y * image.get_width() + x) * 4 + c] - channel)).toBeLessThan(15)
      })
    })
    // The vertical stem of F starts at (6, 18) in the source. Checking its
    // destination also detects reflections within a tile, not just tile order.
    const stem = [
      [6, 18],
      [89, 18],
      [89, 45],
      [6, 45],
      [18, 6],
      [45, 6],
      [45, 89],
      [18, 89],
    ][orientation - 1]
    const x = small ? Math.floor(stem[0] / 2) : stem[0]
    const y = small ? Math.floor(stem[1] / 2) : stem[1]
    for (let c = 0; c < 3; c++) expect(actual[(y * image.get_width() + x) * 4 + c]).toBeLessThan(45)
  } finally {
    image.free()
  }
}

describe("Image.normalize EXIF orientation", () => {
  for (const little of [false, true]) {
    for (const small of [false, true]) {
      for (const [orientation, order] of cases) {
        it.effect(`orientation ${orientation}, ${little ? "II" : "MM"}, ${small ? "resized" : "under limit"}`, () =>
          Effect.gen(function* () {
            const image = yield* Image.Service
            yield* image.transform((editor) =>
              editor.configure({ maxWidth: small ? 48 : 200, maxHeight: small ? 48 : 200 }),
            )
            const input = tagged(orientation, little)
            const original = { ...input }
            const output = yield* image.normalize(input.uri, input)
            expectPixels(output.content, orientation, order, small)
            expect(output.uri).toBe(input.uri)
            expect(output.name).toBe(input.name)
            expect(input).toEqual(original)
            // The encoded result carries upright pixels and must never be transformed again.
            expect(yield* image.normalize(input.uri, output)).toBe(output)
          }),
        )
      }
    }
  }

  it.effect("passes through untagged JPEG, orientation 1 and PNG without re-encoding", () =>
    Effect.gen(function* () {
      const image = yield* Image.Service
      for (const input of [content(jpeg), tagged(1, false), content(png, "image/png")]) {
        expect(yield* image.normalize(input.uri, input)).toBe(input)
      }
    }),
  )

  it.effect("corrects orientation with autoResize disabled but rejects oversized upright dimensions", () =>
    Effect.gen(function* () {
      const image = yield* Image.Service
      yield* image.transform((editor) => editor.configure({ autoResize: false, maxWidth: 64, maxHeight: 96 }))
      const input = tagged(6, true)
      const output = yield* image.normalize(input.uri, input)
      expectPixels(output.content, 6, cases[5][1], false)
      yield* image.transform((editor) => editor.configure({ maxHeight: 64 }))
      const error = yield* image.normalize(input.uri, input).pipe(Effect.flip)
      expect(error).toMatchObject({ _tag: "Image.SizeError", width: 64, height: 96 })
    }),
  )

  it.effect("orients before fitting unequal width and height limits", () =>
    Effect.gen(function* () {
      const image = yield* Image.Service
      yield* image.transform((editor) => editor.configure({ maxWidth: 32, maxHeight: 100 }))
      const input = tagged(6, false)
      const output = yield* image.normalize(input.uri, input)
      expectPixels(output.content, 6, cases[5][1], true)
    }),
  )

  it.effect("does not shrink an orientation-only correction when autoResize is disabled", () =>
    Effect.gen(function* () {
      const noisy = new PhotonImage(
        Uint8Array.from({ length: 96 * 64 * 4 }, (_, i) =>
          i % 4 === 3 ? 255 : (Math.imul(i + 1, 2654435761) >>> 16) % 256,
        ),
        96,
        64,
      )
      const input = tagged(6, false, Buffer.from(noisy.get_bytes_jpeg(5)))
      noisy.free()
      const image = yield* Image.Service
      yield* image.transform((editor) => editor.configure({ autoResize: false, maxBase64Bytes: input.content.length }))
      const error = yield* image.normalize(input.uri, input).pipe(Effect.flip)
      expect(error).toMatchObject({ _tag: "Image.SizeError", width: 64, height: 96 })
    }),
  )

  it.effect("keeps orientation correct through JPEG fallback and repeated normalization", () =>
    Effect.gen(function* () {
      const image = yield* Image.Service
      // This fixture's lossless PNG exceeds this budget; JPEG fits at 32x48.
      yield* image.transform((editor) => editor.configure({ maxWidth: 48, maxHeight: 48, maxBase64Bytes: 1_800 }))
      const input = tagged(7, true)
      const output = yield* image.normalize(input.uri, input)
      expect(output.mime).toBe("image/jpeg")
      expect(output.content.length).toBeLessThanOrEqual(1_800)
      expectPixels(output.content, 7, cases[6][1], true)
      expect(yield* image.normalize(input.uri, output)).toBe(output)
    }),
  )

  it.effect("fits a byte-oversized JPEG without reducing its upright dimensions unnecessarily", () =>
    Effect.gen(function* () {
      const image = yield* Image.Service
      yield* image.transform((editor) => editor.configure({ maxBase64Bytes: 1_800 }))
      const input = tagged(7, false)
      expect(input.content.length).toBeGreaterThan(1_800)
      const output = yield* image.normalize(input.uri, input)
      expect(output.mime).toBe("image/jpeg")
      expect(output.content.length).toBeLessThanOrEqual(1_800)
      expectPixels(output.content, 7, cases[6][1], false)
      expect(yield* image.normalize(input.uri, output)).toBe(output)
    }),
  )

  it.effect("finds EXIF after other APP segments and JPEG marker padding", () =>
    Effect.gen(function* () {
      const image = yield* Image.Service
      const input = content(
        Buffer.concat([
          jpeg.subarray(0, 2),
          Buffer.from([0xff, 0xe1, 0, 6, 0x58, 0x4d, 0x50, 0]),
          Buffer.from([0xff]),
          exif(8, false),
          jpeg.subarray(2),
        ]),
      )
      const output = yield* image.normalize(input.uri, input)
      expectPixels(output.content, 8, cases[7][1], false)
    }),
  )

  it.effect("ignores malformed or unsupported EXIF without rejecting decodable JPEGs", () =>
    Effect.gen(function* () {
      const image = yield* Image.Service
      const invalid = [
        exif(0, true),
        exif(9, false),
        Buffer.from([0xff, 0xe1, 0, 8, 0x45, 0x78, 0x69, 0x66, 0, 0]),
        ...[
          (b: Buffer) => b.writeUInt16BE(0, 10), // byte order
          (b: Buffer) => b.writeUInt16BE(0, 12), // TIFF magic
          (b: Buffer) => b.writeUInt32BE(0xffffffff, 14), // IFD outside APP1
          (b: Buffer) => b.writeUInt32BE(4, 14), // IFD overlaps TIFF header
          (b: Buffer) => b.writeUInt16BE(4, 38), // Orientation is not SHORT
          (b: Buffer) => b.writeUInt32BE(2, 40), // Orientation count is not one
          (b: Buffer) => {
            b.writeUInt16BE(0xffff, 22)
            b.writeUInt16BE(0, 36)
          }, // truncated IFD
        ].map((edit) => {
          const segment = exif(6, false)
          edit(segment)
          return segment
        }),
      ]
      for (const segment of invalid) {
        const input = content(Buffer.concat([jpeg.subarray(0, 2), segment, jpeg.subarray(2)]))
        expect(yield* image.normalize(input.uri, input)).toBe(input)
      }
    }),
  )
})
