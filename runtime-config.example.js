const runtimeConfig = {
  gatewayUrl: "https://your-questforge-worker.example.workers.dev",
  joinGuildUrl: "/next/",
  sourceUrl: "https://github.com/your-account/QuestForge",
  externalOAuthEnabled: false,
  telemetryEndpoint: "",
  appwriteEndpoint: "https://sgp.cloud.appwrite.io/v1",
  appwriteProjectId: "YOUR_APPWRITE_PROJECT_ID",
};

globalThis.QuestForgeConfig = runtimeConfig;
export default runtimeConfig;
