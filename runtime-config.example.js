const runtimeConfig = {
  gatewayUrl: "https://mcp.guilduo.com",
  webApiBaseUrl: "",
  joinGuildUrl: "https://app.guilduo.com/",
  sourceUrl: "https://github.com/your-account/QuestForge",
  externalOAuthEnabled: false,
  telemetryEndpoint: "",
  appwriteEndpoint: "https://api.guilduo.com/v1",
  appwriteProjectId: "YOUR_APPWRITE_PROJECT_ID",
};

globalThis.QuestForgeConfig = runtimeConfig;
export default runtimeConfig;
