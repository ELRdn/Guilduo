window.__ModuleLoader__.load({id:"@guilduo/dsh-oauth-poc",factory:(require)=>{var module={exports:{}};var exports=module.exports;
"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/client.tsx
var client_exports = {};
__export(client_exports, {
  GuilduoSection: () => GuilduoSection,
  apply: () => apply,
  createClientControl: () => createClientControl,
  inject: () => inject
});
module.exports = __toCommonJS(client_exports);
var import_react = require("react");
var import_dsh_client_store = require("@deepseek-ai/dsh-client-store");
var import_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
var import_jsx_runtime = require("react/jsx-runtime");
var inject = ["slots", "connection", "uiSession"];
var MCP_ENDPOINT = "https://mcp.guilduo.com/mcp";
var SAFE_ERROR = "\u63A5\u7D9A\u64CD\u4F5C\u306B\u5931\u6557\u3057\u307E\u3057\u305F\u3002\u3082\u3046\u4E00\u5EA6\u304A\u8A66\u3057\u304F\u3060\u3055\u3044\u3002";
var DISCONNECTED = { state: "disconnected", tools: 0, scope: "none", canShare: false };
function record(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function status(value) {
  if (!record(value) || Object.keys(value).length !== 4 || typeof value.state !== "string" || !["disconnected", "connecting", "connected", "failed"].includes(value.state) || !Number.isSafeInteger(value.tools) || value.tools < 0 || typeof value.scope !== "string" || !["none", "session", "shared"].includes(value.scope) || typeof value.canShare !== "boolean") throw new Error(SAFE_ERROR);
  return value;
}
function authorization(value) {
  if (!record(value) || Object.keys(value).length !== 1 || typeof value.authorizationUrl !== "string") {
    throw new Error(SAFE_ERROR);
  }
  const url = new URL(value.authorizationUrl);
  if (url.origin !== "https://mcp.guilduo.com" || url.pathname !== "/oauth/authorize" || url.username || url.password || url.hash) throw new Error(SAFE_ERROR);
  return url.href;
}
function createClientControl(rpc, selection, isLoopback, connectionGeneration) {
  const state = (0, import_dsh_client_store.createSnapshotStore)({ ...DISCONNECTED, busy: false });
  let generation = 0;
  let request = new AbortController();
  let timer;
  let disposed = false;
  let pendingAuth = false;
  let hostGeneration = connectionGeneration?.getSnapshot()?.id;
  const isReady = () => !connectionGeneration || connectionGeneration.getSnapshot() !== void 0;
  const current = (id, version) => !disposed && version === generation && state.getSnapshot().sessionId === id;
  const stop = () => {
    generation++;
    request.abort();
    request = new AbortController();
    clearTimeout(timer);
  };
  const invoke = async (method, id, signal) => {
    const result = await rpc.call("/api", `guilduo/${method}`, { args: { sessionId: id } }, signal);
    if (!record(result) || result.ok !== true || !record(result.value) || result.value.ok !== true || Object.keys(result.value).length !== 2 || !("value" in result.value)) {
      throw new Error(SAFE_ERROR);
    }
    return result.value.value;
  };
  const cancelAttempt = (id) => {
    if (!pendingAuth) return;
    pendingAuth = false;
    void invoke("cancel", id).catch(() => {
    });
  };
  const fail = (id, version) => {
    if (current(id, version)) state.set({
      ...state.getSnapshot(),
      state: "failed",
      tools: 0,
      canShare: false,
      authorizationUrl: void 0,
      busy: false
    });
  };
  const refresh = async (id, version) => {
    try {
      const next = status(await invoke("status", id, request.signal));
      if (!current(id, version)) return;
      if (next.state !== "connecting") pendingAuth = false;
      state.set({
        sessionId: id,
        ...next,
        busy: false,
        ...next.state === "connecting" ? { authorizationUrl: state.getSnapshot().authorizationUrl } : {}
      });
      if (next.state === "connecting") timer = setTimeout(() => {
        void refresh(id, version);
      }, 1e3);
    } catch {
      if (current(id, version)) cancelAttempt(id);
      fail(id, version);
    }
  };
  const select = () => {
    const key = selection.getSnapshot().key;
    const id = typeof key === "string" && key.trim() ? key : void 0;
    const previous = state.getSnapshot();
    if (id === previous.sessionId) return;
    stop();
    if (previous.sessionId) cancelAttempt(previous.sessionId);
    state.set({ sessionId: id, ...DISCONNECTED, busy: id !== void 0 && isLoopback && isReady() });
    if (id && isLoopback && isReady()) void refresh(id, generation);
  };
  const unsubscribe = selection.subscribe(select);
  const reset = () => {
    if (disposed) return;
    stop();
    pendingAuth = false;
    state.set({ ...DISCONNECTED, busy: false });
    select();
  };
  const unsubscribeGeneration = connectionGeneration?.subscribe(() => {
    const next = connectionGeneration.getSnapshot()?.id;
    if (next === hostGeneration) return;
    hostGeneration = next;
    reset();
  });
  select();
  const action = async (method) => {
    const before = state.getSnapshot();
    if (disposed || !isLoopback || !isReady() || !before.sessionId) return;
    stop();
    pendingAuth = false;
    const id = before.sessionId;
    const version = generation;
    state.set({ ...before, authorizationUrl: void 0, busy: true });
    try {
      const next = status(await invoke(method, id, request.signal));
      if (current(id, version)) state.set({ sessionId: id, ...next, busy: false });
    } catch {
      fail(id, version);
    }
  };
  return {
    state,
    isLoopback,
    isReady,
    reset,
    refresh: reset,
    async connect() {
      const before = state.getSnapshot();
      if (disposed || !isLoopback || !isReady() || !before.sessionId || before.busy || before.state === "connecting" || before.state === "connected") return;
      stop();
      const id = before.sessionId;
      const version = generation;
      pendingAuth = true;
      state.set({ sessionId: id, ...DISCONNECTED, state: "connecting", busy: true });
      try {
        const url = authorization(await invoke("connect", id, request.signal));
        if (!current(id, version)) return;
        state.set({ sessionId: id, ...DISCONNECTED, state: "connecting", busy: false, authorizationUrl: url });
        void refresh(id, version);
      } catch {
        if (current(id, version)) {
          cancelAttempt(id);
          fail(id, version);
        }
      }
    },
    disconnect: () => action("disconnect"),
    async cancel() {
      if (!pendingAuth || state.getSnapshot().state !== "connecting") return;
      await action("cancel");
    },
    async share() {
      const before = state.getSnapshot();
      if (before.busy || before.state !== "connected" || before.scope !== "session" || !before.canShare) return;
      await action("share");
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      unsubscribe();
      unsubscribeGeneration?.();
      stop();
      const previous = state.getSnapshot();
      if (previous.sessionId) cancelAttempt(previous.sessionId);
      state.set({ ...DISCONNECTED, busy: false });
    }
  };
}
var labels = { disconnected: "\u672A\u63A5\u7D9A", connecting: "\u63A5\u7D9A\u4E2D", connected: "\u63A5\u7D9A\u6E08\u307F", failed: "\u5931\u6557" };
function GuilduoSection({ control }) {
  const snapshot = (0, import_react.useSyncExternalStore)(control.state.subscribe, control.state.getSnapshot, control.state.getSnapshot);
  const disabled = !control.isLoopback || !control.isReady() || !snapshot.sessionId || snapshot.busy;
  (0, import_react.useEffect)(() => {
    control.refresh();
    return () => {
      void control.cancel();
    };
  }, [control]);
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", { "aria-label": "Guilduo", style: { display: "flex", flexDirection: "column", gap: 16 }, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", { children: "Guilduo" }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: "Guilduo MCP\u3078\u306E\u63A5\u7D9A\u306F\u3001\u901A\u5E38\u306E\u4F1A\u8A71\u3068\u30D5\u30A9\u30FC\u30AF\u3092\u542B\u3080\u5168\u4F1A\u8A71\u3067\u4F7F\u3048\u307E\u3059\u3002\u540C\u3058Windows\u30E6\u30FC\u30B6\u30FC\u30FBDSH Home\u306EWeb\uFF0FDesktop\u3067\u5171\u6709\u3057\u307E\u3059\u3002" }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", { role: "status", "aria-live": "polite", children: [
      snapshot.busy ? "\u63A5\u7D9A\u72B6\u614B\u3092\u78BA\u8A8D\u4E2D\u2026" : labels[snapshot.state],
      snapshot.state === "connected" ? `\uFF08\u30C4\u30FC\u30EB ${snapshot.tools} \u4EF6\uFF09` : ""
    ] }),
    snapshot.scope === "shared" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: "\u63A5\u7D9A\u7BC4\u56F2: \u5168\u4F1A\u8A71\u3067\u5171\u6709\uFF08\u901A\u5E38\u306E\u4F1A\u8A71\u30FB\u30D5\u30A9\u30FC\u30AF\uFF09\u3002\u5207\u65AD\u3059\u308B\u3068\u3001Web\uFF0FDesktop\u3092\u542B\u3080\u5168\u4F1A\u8A71\u3067Guilduo\u304C\u4F7F\u3048\u306A\u304F\u306A\u308A\u307E\u3059\u3002" }),
    snapshot.scope === "session" && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", { children: [
      "\u63A5\u7D9A\u7BC4\u56F2: \u3053\u306E\u4F1A\u8A71\u306E\u307F\uFF08\u65E7\u63A5\u7D9A\uFF09\u3002",
      snapshot.canShare ? "\u300C\u5168\u4F1A\u8A71\u3067\u4F7F\u3046\u300D\u3067\u5171\u6709\u3067\u304D\u307E\u3059\u3002" : ""
    ] }),
    !snapshot.sessionId && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: "\u4F1A\u8A71\u3092\u958B\u3044\u3066\u304B\u3089\u63A5\u7D9A\u3057\u3066\u304F\u3060\u3055\u3044\u3002" }),
    !control.isLoopback && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: "\u30ED\u30FC\u30AB\u30EB\u306EDSH\u304B\u3089\u63A5\u7D9A\u3057\u3066\u304F\u3060\u3055\u3044\u3002" }),
    control.isLoopback && !control.isReady() && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: "DSH\u3068\u306E\u63A5\u7D9A\u3092\u5F85\u3063\u3066\u3044\u307E\u3059\u3002" }),
    snapshot.state === "failed" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { role: "alert", children: SAFE_ERROR }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { display: "flex", flexWrap: "wrap", gap: 8 }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        import_dsh_client_ui_primitives.Button,
        {
          type: "button",
          variant: "primary",
          style: { minHeight: 44 },
          disabled: disabled || snapshot.state === "connecting" || snapshot.state === "connected",
          onClick: () => {
            void control.connect();
          },
          children: "\u63A5\u7D9A"
        }
      ),
      snapshot.scope === "session" && snapshot.canShare && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        import_dsh_client_ui_primitives.Button,
        {
          type: "button",
          variant: "primary",
          style: { minHeight: 44 },
          disabled: disabled || snapshot.state !== "connected",
          onClick: () => {
            void control.share();
          },
          children: "\u5168\u4F1A\u8A71\u3067\u4F7F\u3046"
        }
      ),
      snapshot.authorizationUrl && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        "a",
        {
          href: snapshot.authorizationUrl,
          target: "_blank",
          rel: "noopener noreferrer",
          style: { display: "inline-flex", alignItems: "center", minHeight: 44 },
          children: "\u30D6\u30E9\u30A6\u30B6\u30FC\u3067\u8A8D\u8A3C"
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        import_dsh_client_ui_primitives.Button,
        {
          type: "button",
          variant: "outline",
          style: { minHeight: 44 },
          disabled: !control.isLoopback || !control.isReady() || !snapshot.sessionId || snapshot.busy && snapshot.state !== "connecting" || snapshot.state === "disconnected",
          onClick: () => {
            void control.disconnect();
          },
          children: "\u5207\u65AD"
        }
      )
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", { style: { overflowWrap: "anywhere" }, children: [
      "MCP endpoint: ",
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("code", { children: MCP_ENDPOINT })
    ] })
  ] });
}
function apply(ctx) {
  const connection = ctx.get("connection");
  const control = createClientControl(connection.rpc, ctx.uiSession.adapter.current, connection.isLoopback === true, connection.generation);
  ctx.effect(() => () => control.dispose(), "guilduo.client");
  ctx.on("connection/reset", control.reset);
  ctx.slots.inject("settings.section", () => ctx.slots.register({
    name: "settings.section",
    id: "guilduo",
    order: 60,
    label: "Guilduo",
    inject: () => ({ control })
  }, GuilduoSection));
}
return module.exports;}});
