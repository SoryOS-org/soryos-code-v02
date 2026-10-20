const stage = process.env.SST_STAGE || "dev"

export default {
  url: stage === "production" ? "https://lutungcode.ai" : `https://${stage}.lutungcode.ai`,
  console: stage === "production" ? "https://lutungcode.ai/auth" : `https://${stage}.lutungcode.ai/auth`,
  email: "help@anoma.ly",
  socialCard: "https://social-cards.sst.dev",
  github: "https://github.com/anomalyco/lutungcode",
  discord: "https://lutungcode.ai/discord",
  headerLinks: [
    { name: "app.header.home", url: "/" },
    { name: "app.header.docs", url: "/v2/docs" },
  ],
}
