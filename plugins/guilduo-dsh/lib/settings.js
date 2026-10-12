// SPDX-License-Identifier: AGPL-3.0-only
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { SessionId } from '@deepseek-ai/dsh-session/types';
export const LOGIN_TIMEOUT_MS = 5 * 60_000;
const scrub = "history.replaceState(null, '', '/callback');";
const csp = `default-src 'none'; script-src 'sha256-${createHash('sha256').update(scrub).digest('base64')}'`;
const failure = (code, message) => ({ ok: false, error: { code, message, details: {} } });
/** Authenticated human UI only; no model-facing login tools or durable secrets. */
export function createSettingsBridge(ctx, control, timeoutMs = LOGIN_TIMEOUT_MS) {
    const attempts = new Map();
    const starting = new Set();
    const cancelledStarts = new Set();
    let disposed = false;
    const current = (attempt) => !disposed && !attempt.closed &&
        attempts.get(attempt.agent.id) === attempt && ctx.agents.get(attempt.agent.id) === attempt.agent;
    const closeListener = (attempt) => {
        clearTimeout(attempt.timer);
        attempt.state = undefined;
        attempt.server.close();
        attempt.server.closeAllConnections();
    };
    const cancel = async (attempt, phase, retainGrant = false) => {
        if (attempt.closed)
            return;
        attempt.closed = true;
        attempt.phase = phase;
        attempt.abort.abort();
        closeListener(attempt);
        if (retainGrant)
            await control.release(attempt.agent.id);
        else
            await control.cancelLogin(attempt.agent.id);
    };
    const status = (id) => {
        const attempt = attempts.get(id);
        const saved = control.status(id);
        const state = saved.connected ? 'connected' : saved.failed ? 'failed' : attempt?.phase === 'connected' ? 'disconnected' : attempt?.phase ?? 'disconnected';
        return { state, tools: saved.tools, scope: saved.scope, canShare: saved.canShare };
    };
    const handle = async (endpoint, payload, signal, peer) => {
        if (disposed || peer !== ctx.connection.operator)
            return failure('guilduo/unauthorized', 'Guilduo settings require the authenticated operator.');
        if (!payload || typeof payload !== 'object' || Array.isArray(payload) ||
            Object.keys(payload).length !== 1 || !('sessionId' in payload) ||
            typeof payload.sessionId !== 'string' || !payload.sessionId.trim() || payload.sessionId.length > 256) {
            return failure('guilduo/invalid-request', 'Select a conversation before connecting Guilduo.');
        }
        const id = payload.sessionId;
        try {
            const prior = attempts.get(id);
            if (prior && !current(prior) && !prior.closed)
                await cancel(prior, 'disconnected', prior.phase === 'connected');
            if (prior && !prior.closed && prior.phase === 'connected' && !control.status(id).connected) {
                prior.closed = true;
                closeListener(prior);
            }
            if (endpoint === 'guilduo/status') {
                if (!starting.has(id) && (!prior || prior.closed) && !control.status(id).connected) {
                    try {
                        await control.restore(id);
                    }
                    catch {
                        return { ok: true, value: { ...status(id), state: 'failed' } };
                    }
                }
                return { ok: true, value: status(id) };
            }
            if (endpoint === 'guilduo/cancel') {
                if (starting.has(id))
                    cancelledStarts.add(id);
                if (prior && !prior.closed && prior.phase === 'connecting')
                    await cancel(prior, 'disconnected');
                else
                    await control.cancelLogin(id);
                return { ok: true, value: status(id) };
            }
            if (endpoint === 'guilduo/share') {
                signal.throwIfAborted();
                await control.share(id, signal);
                return { ok: true, value: status(id) };
            }
            if (endpoint === 'guilduo/disconnect') {
                for (const startingId of starting)
                    cancelledStarts.add(startingId);
                await Promise.allSettled([...attempts.values()].filter(attempt => !attempt.closed)
                    .map(attempt => cancel(attempt, 'disconnected', attempt.phase === 'connected')));
                await control.logout(id);
                return { ok: true, value: status(id) };
            }
            if (endpoint !== 'guilduo/connect')
                return failure('guilduo/unknown-action', 'Unknown Guilduo settings action.');
            if (starting.size || (prior && !prior.closed))
                return failure('guilduo/already-active', 'Guilduo is already connecting or connected.');
            starting.add(id);
            let attempt;
            let abort;
            let abortStartup;
            try {
                // Resolve through the host controller; the UI cannot manufacture an Agent owner.
                const resolved = await ctx.sessionController.resolveAgent(SessionId(id));
                signal.throwIfAborted();
                if ('error' in resolved || disposed || cancelledStarts.has(id) || ctx.agents.get(resolved.agent.id) !== resolved.agent) {
                    return failure('guilduo/session-unavailable', 'Open an available conversation before connecting Guilduo.');
                }
                const agent = resolved.agent;
                if (agent.id !== id)
                    return failure('guilduo/session-unavailable', 'The selected conversation changed.');
                const server = createServer((request, response) => {
                    response.setHeader('Cache-Control', 'no-store');
                    response.setHeader('Referrer-Policy', 'no-referrer');
                    response.setHeader('X-Content-Type-Options', 'nosniff');
                    const owner = attempt;
                    let url;
                    try {
                        url = new URL(request.url ?? '/', owner?.redirect);
                    }
                    catch {
                        response.writeHead(400).end('Invalid callback.');
                        return;
                    }
                    if (!owner || request.method !== 'GET' || request.headers.host !== owner.redirect.host ||
                        url.origin !== owner.redirect.origin || url.pathname !== owner.redirect.pathname ||
                        url.hash || url.username || url.password || url.href.length > 8192 ||
                        !current(owner) || owner.claimed || !owner.state ||
                        url.searchParams.getAll('state').length !== 1 || url.searchParams.get('state') !== owner.state ||
                        url.searchParams.getAll('iss').length > 1) {
                        response.writeHead(400).end('Invalid or expired callback.');
                        return;
                    }
                    const denied = url.searchParams.getAll('error').length === 1 &&
                        Boolean(url.searchParams.get('error')) && !url.searchParams.has('code');
                    if (!denied && (url.searchParams.has('error') ||
                        url.searchParams.getAll('code').length !== 1 || !url.searchParams.get('code'))) {
                        response.writeHead(400).end('Invalid callback.');
                        return;
                    }
                    owner.claimed = true;
                    owner.state = undefined;
                    const reply = (code, message) => {
                        response.setHeader('Content-Type', 'text/html; charset=utf-8');
                        response.setHeader('Content-Security-Policy', csp);
                        response.writeHead(code).end(`<script>${scrub}</script><p>${message}</p>`);
                    };
                    if (denied) {
                        response.once('finish', () => { void cancel(owner, 'disconnected').catch(() => { }); });
                        reply(400, 'Guilduo connection cancelled. Return to DSH.');
                        return;
                    }
                    void (async () => {
                        try {
                            await control.finish(agent.id, url.href);
                            if (!current(owner))
                                throw new Error('Login no longer belongs to this conversation');
                            owner.phase = 'connected';
                            reply(200, 'Guilduo connected. Return to DSH.');
                            // Close after response bytes are flushed, without retaining a callback endpoint.
                            clearTimeout(owner.timer);
                            owner.server.close();
                        }
                        catch {
                            response.once('finish', () => { void cancel(owner, 'failed').catch(() => { }); });
                            reply(400, 'Guilduo connection failed. Start again in DSH settings.');
                        }
                    })().catch(() => { response.destroy(); });
                });
                await new Promise((resolve, reject) => {
                    server.once('error', reject);
                    server.listen(0, '127.0.0.1', () => { server.removeListener('error', reject); resolve(); });
                });
                const address = server.address();
                if (!address || typeof address === 'string') {
                    server.close();
                    throw new Error('Callback listener unavailable');
                }
                attempt = { agent, server, redirect: new URL(`http://127.0.0.1:${address.port}/callback`), abort: new AbortController(), phase: 'connecting', claimed: false, closed: false };
                attempts.set(id, attempt);
                const owned = attempt;
                server.on('error', () => { void cancel(owned, 'failed').catch(() => { }); });
                owned.timer = setTimeout(() => { void cancel(owned, 'failed').catch(() => { }); }, timeoutMs);
                owned.timer.unref();
                abort = () => { void cancel(owned, 'disconnected').catch(() => { }); };
                signal.addEventListener('abort', abort, { once: true });
                signal.throwIfAborted();
                if (!current(owned) || cancelledStarts.has(id))
                    throw new Error('Login cancelled');
                let authorizationUrl;
                const begin = control.begin(agent.id, owned.redirect.href, (url) => {
                    if (!current(owned))
                        throw new Error('Login cancelled');
                    owned.state = url.searchParams.get('state') ?? undefined;
                    authorizationUrl = url.href;
                });
                await Promise.race([begin, new Promise((_, reject) => {
                        abortStartup = () => reject(new Error('Login startup cancelled'));
                        owned.abort.signal.addEventListener('abort', abortStartup, { once: true });
                        if (owned.abort.signal.aborted)
                            abortStartup();
                    })]);
                signal.throwIfAborted();
                if (!authorizationUrl || !current(owned))
                    throw new Error('No active authorization');
                return { ok: true, value: { authorizationUrl } };
            }
            catch {
                if (attempt)
                    await cancel(attempt, 'failed');
                return failure('guilduo/login-failed', 'Guilduo could not start a connection. Try again in settings.');
            }
            finally {
                if (abort)
                    signal.removeEventListener('abort', abort);
                if (abortStartup)
                    attempt?.abort.signal.removeEventListener('abort', abortStartup);
                starting.delete(id);
                cancelledStarts.delete(id);
            }
        }
        catch {
            return failure('guilduo/settings-failed', 'Guilduo settings could not complete this action.');
        }
    };
    ctx.on('session/disposed', async (session) => {
        if (starting.has(session.id))
            cancelledStarts.add(session.id);
        const attempt = attempts.get(session.id);
        if (attempt) {
            await cancel(attempt, 'disconnected', attempt.phase === 'connected');
            if (attempts.get(session.id) === attempt)
                attempts.delete(session.id);
        }
    });
    ctx.on('agent/disposed', async ({ agent }) => {
        if (starting.has(agent.id))
            cancelledStarts.add(agent.id);
        const attempt = attempts.get(agent.id);
        if (attempt?.agent === agent) {
            await cancel(attempt, 'disconnected', attempt.phase === 'connected');
            if (attempts.get(agent.id) === attempt)
                attempts.delete(agent.id);
        }
    });
    return {
        handle,
        async dispose() {
            disposed = true;
            await Promise.allSettled([...attempts.values()].map(attempt => cancel(attempt, 'disconnected', attempt.phase === 'connected')));
            attempts.clear();
        },
    };
}
