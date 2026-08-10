const runtimeConfig = {
  gatewayUrl: "https://your-questforge-worker.example.workers.dev",
  sourceUrl: "https://github.com/your-account/QuestForge",
};

globalThis.QuestForgeConfig = runtimeConfig;
export default runtimeConfig;
