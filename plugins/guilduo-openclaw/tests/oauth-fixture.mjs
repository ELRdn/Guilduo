// SPDX-License-Identifier: AGPL-3.0-only
// Loopback-only synthetic OAuth/MCP fixture; never used by the shipped extension.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { createServer as createSecureServer } from 'node:https';

export async function startOAuthFixture({ expiresIn = 3600, tls } = {}) {
  let origin, challenge, redirect, verified = false, discovered = false, invoked = false;
  let currentAccess = 'synthetic-access', currentRefresh = 'synthetic-refresh';
  const refreshes = [], acceptedAccess = new Set();
  const json = (res, body, status = 200) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
  const handler = async (req, res) => {
    try {
      const url = new URL(req.url, origin);
      let body = ''; for await (const chunk of req) body += chunk;
      if (url.pathname.startsWith('/.well-known/oauth-protected-resource')) return json(res, { resource: `${origin}/mcp`, authorization_servers: [origin] });
      if (url.pathname === '/.well-known/oauth-authorization-server') return json(res, {
        issuer: origin, authorization_endpoint: `${origin}/authorize`, token_endpoint: `${origin}/token`, registration_endpoint: `${origin}/register`,
        response_types_supported: ['code'], grant_types_supported: ['authorization_code', 'refresh_token'], token_endpoint_auth_methods_supported: ['none'], code_challenge_methods_supported: ['S256'],
      });
      if (url.pathname === '/register') return json(res, { ...JSON.parse(body), client_id: 'synthetic-client', client_id_issued_at: Math.floor(Date.now() / 1000) }, 201);
      if (url.pathname === '/authorize') {
        challenge = url.searchParams.get('code_challenge'); redirect = url.searchParams.get('redirect_uri');
        assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
        assert.ok(challenge && redirect && url.searchParams.get('state'));
        const callback = new URL(redirect); callback.searchParams.set('code', 'synthetic-code'); callback.searchParams.set('state', url.searchParams.get('state'));
        res.writeHead(302, { Location: callback.href }); return res.end();
      }
      if (url.pathname === '/token') {
        const form = new URLSearchParams(body);
        if (form.get('grant_type') === 'refresh_token') {
          assert.equal(form.get('refresh_token'), currentRefresh, 'Only the current rotated refresh token may be consumed');
          refreshes.push(currentRefresh);
          currentAccess = `synthetic-access-${refreshes.length}`;
          currentRefresh = `synthetic-refresh-${refreshes.length}`;
          return json(res, { access_token: currentAccess, refresh_token: currentRefresh, token_type: 'Bearer', expires_in: expiresIn });
        }
        assert.equal(form.get('grant_type'), 'authorization_code');
        assert.equal(form.get('code'), 'synthetic-code'); assert.equal(form.get('redirect_uri'), redirect);
        assert.equal(createHash('sha256').update(form.get('code_verifier')).digest('base64url'), challenge);
        verified = true;
        return json(res, { access_token: currentAccess, refresh_token: currentRefresh, token_type: 'Bearer', expires_in: expiresIn });
      }
      if (url.pathname === '/mcp') {
        if (req.method !== 'POST') { res.writeHead(405); return res.end(); }
        if (req.headers.authorization !== `Bearer ${currentAccess}`) {
          res.writeHead(401, { 'WWW-Authenticate': `Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource"` }); return res.end();
        }
        acceptedAccess.add(currentAccess);
        const message = JSON.parse(body);
        if (message.method === 'notifications/initialized') { res.writeHead(202); return res.end(); }
        let result;
        if (message.method === 'initialize') result = { protocolVersion: '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'synthetic-guilduo', version: '1.0.0' } };
        else if (message.method === 'tools/list') { discovered = true; result = { tools: [{ name: 'read_fixture', description: 'Synthetic read only', inputSchema: { type: 'object', properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true } }] }; }
        else if (message.method === 'tools/call') { assert.equal(message.params.name, 'read_fixture'); invoked = true; result = { content: [{ type: 'text', text: 'synthetic fixture read accepted' }], isError: false }; }
        else if (message.method === 'ping') result = {};
        else return json(res, { jsonrpc: '2.0', id: message.id, error: { code: -32601, message: 'Not implemented' } });
        return json(res, { jsonrpc: '2.0', id: message.id, result });
      }
      res.writeHead(404); res.end();
    } catch (error) { json(res, { error: error.message }, 400); }
  };
  const server = tls ? createSecureServer(tls, handler) : createServer(handler);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  origin = `${tls ? 'https' : 'http'}://127.0.0.1:${server.address().port}`;
  return { origin, pkceVerified: () => verified, probed: () => discovered, invoked: () => invoked,
    rotation: () => ({ consumed: [...refreshes], acceptedAccess: [...acceptedAccess], currentAccess, currentRefresh }),
    async authorize(url) {
      const start = await fetch(url, { redirect: 'manual' }); assert.equal(start.status, 302);
      const callback = new URL(start.headers.get('location'));
      const wrong = new URL(callback); wrong.searchParams.set('state', 'wrong-synthetic-state');
      assert.equal((await fetch(wrong)).status, 400, 'native loopback must reject wrong state');
      assert.equal((await fetch(callback)).status, 200);
    },
    close: () => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }),
  };
}
