import type { QuestForgeState } from "./questforge";

declare global {
  interface QuestForgeRuntimeConfig {
    gatewayUrl?: string;
    sourceUrl?: string;
    externalOAuthEnabled?: boolean;
    telemetryEndpoint?: string;
  }

  interface Window {
    webkitAudioContext?: typeof AudioContext;
    QuestForgeFirebase?: Record<string, unknown>;
  }

  var QuestForgeConfig: QuestForgeRuntimeConfig | undefined;
  var QuestForgeI18n: Record<string, unknown> | undefined;
  var QuestForgeCore: Record<string, unknown> | undefined;
  var QuestForgeBattleRules: Record<string, unknown> | undefined;
  var QuestForgeBridge: Record<string, unknown> | undefined;
  var QuestForgeTelemetry: Record<string, unknown> | undefined;
  var QuestForgeFirebase: Record<string, unknown> | undefined;

  interface CustomEventMap {
    "questforge:state-saved": CustomEvent<{ state?: QuestForgeState }>;
    "questforge:auth-changed": CustomEvent<{ user: unknown }>;
    "questforge:locale-changed": CustomEvent<{ locale: string }>;
    "questforge:telemetry-ready": CustomEvent<void>;
  }
}

export {};
