export const productName = "LutungCode"
export const command = "lutungcode"
export const slug = "lutungcode"
export const configNames = ["lutungcode.json", "lutungcode.jsonc"] as const
export const projectDirectory = ".lutungcode"
export const databaseFilename = "lutungcode.db"
export const authUsername = "lutungcode"
export const headerPrefix = "x-lutungcode-"
export const userAgentProduct = "lutungcode"
export const urlScheme = "lutungcode"
export const appId = "app.lutungcode.desktop"
export const managedPreferences = "app.lutungcode.managed"
export const npmScope = "@lutungcode"

export const env = {
  configDir: "LUTUNGCODE_CONFIG_DIR",
  testHome: "LUTUNGCODE_TEST_HOME",
  password: "LUTUNGCODE_PASSWORD",
  serverPassword: "LUTUNGCODE_SERVER_PASSWORD",
  database: "LUTUNGCODE_DB",
  disableChannelDb: "LUTUNGCODE_DISABLE_CHANNEL_DB",
} as const

// Owned publication endpoints stay empty until a domain, registry, and package listing exist.
// Callers must skip the feature when a value is empty.
export const endpoints: {
  readonly domain: string
  readonly githubRepository: string
  readonly containerRepository: string
  readonly homebrewFormula: string
  readonly aurPackage: string
  readonly wingetId: string
  readonly updateBase: string
  readonly modelsUrl: string
  readonly installUrl: string
  readonly consoleUrl: string
} = {
  domain: "",
  githubRepository: "",
  containerRepository: "",
  homebrewFormula: "",
  aurPackage: "",
  wingetId: "",
  updateBase: "",
  modelsUrl: "",
  installUrl: "",
  consoleUrl: "",
}

export function configured(value: string) {
  return value.length > 0
}
