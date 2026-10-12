// Disposable Miniflare entry only. Never imported by the production worker.
import { approveAuthorization, authorizePage, deleteAuthorizedClient, registerClient, revokeAuthorizedClient, revokeToken, tokenEndpoint } from "../../worker/src/oauth.ts";
import { authenticateRequest } from "../../worker/src/security.ts";
import type { WorkerEnv } from "../../worker/src/worker-types.ts";

export default {
  async fetch(request: Request, bindings: WorkerEnv): Promise<Response> {
    const url = new URL(request.url);
    const env = { ...bindings, PUBLIC_BASE_URL: url.origin };
    let revocationChanges: number | undefined;
    // Pause immediately before the candidate's conditional revocation SQL;
    // all statements still execute on the real D1 binding, unchanged.
    if (url.pathname === "/oauth/revoke" && bindings.QUESTFORGE_DB) {
      const db = bindings.QUESTFORGE_DB;
      env.QUESTFORGE_DB = {
        batch: db.batch.bind(db),
        prepare(sql) {
          const statement = db.prepare(sql);
          if (!sql.includes("json_set(oauth_records.value_json")) return statement;
          const bind = statement.bind.bind(statement);
          statement.bind = (...values) => {
            const bound = bind(...values);
            const run = bound.run.bind(bound);
            bound.run = async () => {
              if (request.headers.get("x-fixture-pause-revoke") === "1") await fetch("https://control.fixture.test/revoke");
              const result = await run();
              revocationChanges = result.meta?.changes;
              return result;
            };
            return bound;
          };
          return statement;
        },
      };
    }
    switch (url.pathname) {
      case "/__fixture/disconnect":
      case "/__fixture/hard-delete": {
        const { clientId } = await request.json() as { clientId: string };
        if (request.method !== "POST" || typeof clientId !== "string") return new Response("Invalid fixture request", { status: 400 });
        // Exact OAuth operation used by Web Disconnect, without an expected
        // family hash. This route exists only in this disposable entry.
        const operation = url.pathname === "/__fixture/hard-delete" ? deleteAuthorizedClient : revokeAuthorizedClient;
        return Response.json(await operation(env, "workerd-owner", clientId));
      }
      case "/oauth/register": return registerClient(request, env);
      case "/oauth/authorize": return authorizePage(request, env);
      case "/oauth/approve": return approveAuthorization(request, env);
      case "/oauth/token": return tokenEndpoint(request, env);
      case "/oauth/revoke": {
        const response = await revokeToken(request, env);
        if (revocationChanges !== undefined) response.headers.set("x-fixture-revoke-changes", String(revocationChanges));
        return response;
      }
      case "/mcp":
      case "/v1/quests":
      case "/__fixture/auth": {
        const target = url.pathname === "/__fixture/auth"
          ? new Request(url.searchParams.get("url")!, { headers: request.headers }) : request;
        const identity = await authenticateRequest(target, env);
        return Response.json(identity, { status: identity ? 200 : 401 });
      }
      default: return new Response("Not found", { status: 404 });
    }
  },
};
