const runtimeConfig = {
  gatewayUrl: "https://your-questforge-worker.example.workers.dev",
  sourceUrl: "https://github.com/your-account/QuestForge",
  externalOAuthEnabled: false,
  telemetryEndpoint: "",
};

globalThis.QuestForgeConfig = runtimeConfig;
export default runtimeConfig;
