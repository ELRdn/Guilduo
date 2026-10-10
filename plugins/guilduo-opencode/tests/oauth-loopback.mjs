// SPDX-License-Identifier: AGPL-3.0-only
// Test-only OAuth/DCR/PKCE and empty MCP fixture. All credentials are public synthetic values.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { createServer } from 'node:http';

export async function oauthLoopback() {
  let origin, authorization, accessToken, refreshToken, expires = 0, error;
  let exchanges = 0, refreshes = 0, toolsLists = 0;
  const server = createServer(async (request, response) => {
    const json = (status, body) => { response.writeHead(status, { 'content-type': 'application/json' }); response.end(JSON.stringify(body)); };
    try {
      const url = new URL(request.url, origin);
      let body = ''; for await (const chunk of request) body += chunk;
      if (url.pathname.startsWith('/.well-known/oauth-protected-resource')) return json(200, { resource: `${origin}/mcp`, authorization_servers: [origin] });
      if (url.pathname.startsWith('/.well-known/oauth-authorization-server') || url.pathname.startsWith('/.well-known/openid-configuration')) return json(200, {
        issuer: origin, authorization_endpoint: `${origin}/authorize`, token_endpoint: `${origin}/token`, registration_endpoint: `${origin}/register`,
        response_types_supported: ['code'], grant_types_supported: ['authorization_code', 'refresh_token'], code_challenge_methods_supported: ['S256'], token_endpoint_auth_methods_supported: ['none'],
      });
      if (url.pathname === '/register') {
        const registration = JSON.parse(body);
        assert.ok(registration.redirect_uris.includes(redirectUri));
        return json(201, { ...registration, client_id: 'public-loopback-client' });
      }
      if (url.pathname === '/authorize') {
        assert.equal(url.searchParams.get('client_id'), 'public-loopback-client');
        assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
        assert.equal(url.searchParams.get('resource'), `${origin}/mcp`);
        assert.equal(url.searchParams.get('redirect_uri'), redirectUri);
        assert.ok(url.searchParams.get('state')); authorization = url.searchParams;
        return json(200, { code: 'public-loopback-code', state: authorization.get('state') });
      }
      if (url.pathname === '/token') {
        const form = new URLSearchParams(body); assert.equal(form.get('client_id'), 'public-loopback-client');
        assert.equal(form.get('resource'), `${origin}/mcp`);
        if (form.get('grant_type') === 'authorization_code') {
          assert.equal(exchanges, 0, 'Code must only be exchanged once'); assert.equal(form.get('code'), 'public-loopback-code');
          assert.equal(form.get('redirect_uri'), authorization.get('redirect_uri'));
          assert.equal(createHash('sha256').update(form.get('code_verifier')).digest('base64url'), authorization.get('code_challenge')); exchanges++;
        } else {
          assert.equal(form.get('grant_type'), 'refresh_token'); assert.equal(form.get('refresh_token'), refreshToken); refreshes++;
        }
        accessToken = `public-loopback-access-${exchanges + refreshes}`; refreshToken = `public-loopback-refresh-${exchanges + refreshes}`;
        const lifetime = 3600; expires = Date.now() + lifetime * 1000;
        return json(200, { access_token: accessToken, refresh_token: refreshToken, token_type: 'Bearer', expires_in: lifetime });
      }
      if (url.pathname !== '/mcp') return json(404, {});
      if (request.headers.authorization !== `Bearer ${accessToken}` || Date.now() >= expires) {
        response.setHeader('www-authenticate', `Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource/mcp"`);
        return json(401, { error: 'invalid_token' });
      }
      if (request.method !== 'POST') return json(405, {});
      const rpc = JSON.parse(body);
      if (rpc.id === undefined) { response.writeHead(202); return response.end(); }
      assert.ok(['initialize', 'tools/list', 'ping'].includes(rpc.method), 'Fixture exposes no user tools');
      if (rpc.method === 'tools/list') toolsLists++;
      return json(200, { jsonrpc: '2.0', id: rpc.id, result: rpc.method === 'initialize'
        ? { protocolVersion: rpc.params.protocolVersion, capabilities: { tools: {} }, serverInfo: { name: 'synthetic-loopback', version: '1' } }
        : rpc.method === 'tools/list' ? { tools: [] } : {} });
    } catch (failure) { error = failure; json(500, { error: String(failure) }); }
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening'); origin = `http://127.0.0.1:${server.address().port}`;
  const callback = createServer(); callback.listen(0, '127.0.0.1'); await once(callback, 'listening');
  const redirectUri = `http://127.0.0.1:${callback.address().port}/mcp/oauth/callback`;
  await new Promise((resolve, reject) => callback.close(failure => failure ? reject(failure) : resolve()));
  return { origin, redirectUri, expire: () => { expires = 0; }, get exchanges() { return exchanges; }, get refreshes() { return refreshes; }, get toolsLists() { return toolsLists; }, get error() { return error; },
    close: () => new Promise((resolve, reject) => { server.closeAllConnections(); server.close(failure => failure ? reject(failure) : resolve()); }) };
}
