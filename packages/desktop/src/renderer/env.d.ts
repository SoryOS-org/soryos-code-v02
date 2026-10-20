import type { ElectronNative } from "../preload/types"

declare global {
  interface ImportMetaEnv {
    readonly LUTUNGCODE_TEST_ONBOARDING: boolean
  }

  interface Window {
    electron: ElectronNative
    __LUTUNGCODE__?: {
      deepLinks?: string[]
    }
  }
}
