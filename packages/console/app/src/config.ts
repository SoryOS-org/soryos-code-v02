/**
 * Application-wide constants and configuration
 */
export const config = {
  consoleMarketingEnabled: import.meta.env.VITE_CONSOLE_MARKETING_ENABLED === "true",

  // Base URL
  baseUrl: "https://lutungcode.ai",

  // GitHub
  github: {
    repoUrl: "https://github.com/anomalyco/lutungcode",
    starsFormatted: {
      compact: "215K",
      full: "215,000",
    },
  },

  // Social links
  social: {
    twitter: "https://x.com/lutungcode",
    discord: "https://discord.gg/lutungcode",
  },

  // Static stats (used on landing page)
  stats: {
    contributors: "950",
    commits: "20,000",
    monthlyUsers: "16M",
  },
} as const
