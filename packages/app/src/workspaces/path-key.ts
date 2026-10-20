import { comparablePath } from "@lutungcode/util/path"

export type PathKey = string & { _brand: "PathKey" }

export const pathKey = (path: string) => comparablePath(path) as PathKey
