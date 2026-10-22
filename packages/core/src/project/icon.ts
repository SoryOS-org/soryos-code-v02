export * as ProjectIcon from "./icon.js"

import path from "path"
import { Effect } from "effect"
import { eq } from "drizzle-orm"
import { FSUtil } from "@opencode/util/fs-util"
import { Hash } from "@opencode/util/hash"
import type { EffectDrizzleSqlite } from "../database/drizzle.js"
import { ProjectTable } from "./sql.js"
import type { ProjectSchema } from "./schema.js"

const IMAGES = new Set([".svg", ".png", ".ico", ".jpg", ".jpeg", ".webp"])
const CANDIDATES = [
  "Assets.xcassets/AppIcon.appiconset",
  "ios/App/Assets.xcassets/AppIcon.appiconset",
  ...[
    "assets/app-icon",
    "build/icon",
    "src-tauri/icons/icon",
    "resources/icon",
    "icons/icon",
    "extension/icons/icon",
  ].flatMap((b) => [`${b}.svg`, `${b}.png`]),
  ...["favicon.svg", "icon.svg", "favicon.png", "apple-touch-icon.png", "icon.png", "favicon.ico"].flatMap((f) =>
    ["public/", "app/", "src/app/", "site/public/", ""].map((d) => `${d}${f}`),
  ),
  ...["assets/icon", "assets/logo", "public/logo", "logo"].flatMap((b) => [`${b}.svg`, `${b}.png`]),
]

export const refresh = Effect.fn("ProjectIcon.refresh")(function* (
  fs: FSUtil.Interface,
  db: EffectDrizzleSqlite.EffectSQLiteDatabase,
  id: ProjectSchema.ID,
) {
  const project = yield* db.select().from(ProjectTable).where(eq(ProjectTable.id, id)).get()
  if (!project || id === "global") return
  const root = yield* fs.realPath(project.worktree)
  for (const name of CANDIDATES) {
    const candidate = yield* fs.realPath(path.join(root, name)).pipe(Effect.orElseSucceed(() => undefined))
    if (!candidate || candidate === root || !FSUtil.contains(root, candidate)) continue
    const entries = name.endsWith(".appiconset")
      ? yield* fs.readDirectoryEntries(candidate).pipe(Effect.orElseSucceed(() => []))
      : undefined
    const files = entries
      ?.flatMap((e) => (e.type === "file" && IMAGES.has(path.extname(e.name).toLowerCase()) ? [e.name] : []))
      .toSorted()
    const picked = files ? (files.find((n) => /128|256/.test(n)) ?? files[0]) : undefined
    const file = entries
      ? picked
        ? yield* fs.realPath(path.join(candidate, picked)).pipe(Effect.orElseSucceed(() => undefined))
        : undefined
      : candidate
    if (!file || file === root || !FSUtil.contains(root, file) || !IMAGES.has(path.extname(file).toLowerCase()))
      continue
    const info = yield* fs.stat(file).pipe(Effect.orElseSucceed(() => undefined))
    if (!info || info.type !== "File" || !Number(info.size) || Number(info.size) > 64 * 1024) continue
    const bytes = yield* fs.readFile(file).pipe(Effect.orElseSucceed(() => undefined))
    if (!bytes?.byteLength || bytes.byteLength > 64 * 1024) continue
    const mime = path.extname(file).toLowerCase() === ".ico" ? "image/x-icon" : FSUtil.mimeType(file)
    const url = `data:${mime};base64,${Buffer.from(bytes).toString("base64")}`
    if (url.length > 64 * 1024) continue
    // The stored data URL is the content fingerprint; no separate hash column or cache is needed.
    if (project.icon_url && Hash.fast(project.icon_url) === Hash.fast(url)) return
    return yield* db.update(ProjectTable).set({ icon_url: url }).where(eq(ProjectTable.id, id)).returning().get()
  }
})
