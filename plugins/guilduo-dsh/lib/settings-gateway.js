import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import { createSettingsBridge } from './settings.js';
/** Existing Gateway owns /api; bridge admission requires the real Connection operator on every host. */
export function installSettingsGateway(ctx, control) {
    return ctx.inject(['connection', 'typertGateway', 'agents', 'sessionController'], async (host) => {
        const bridge = createSettingsBridge(host, control);
        host.effect(() => () => bridge.dispose(), 'guilduo.settings-gateway');
        const initializers = [];
        class SettingsGateway extends TypertRemoteService {
            constructor(serviceCtx) {
                super(serviceCtx, 'guilduoSettings', { namespace: 'guilduo' });
                for (const initialize of initializers)
                    initialize.call(this);
            }
            dispatch(action, sessionId) {
                const invocation = this.ctx.invocation;
                if (!invocation || invocation.peer !== host.connection.operator) {
                    return Promise.resolve({ ok: false, error: {
                            code: 'guilduo/unauthorized', message: 'Guilduo settings require the authenticated operator.', details: {},
                        } });
                }
                return bridge.handle(`guilduo/${action}`, { sessionId }, invocation.signal, invocation.peer);
            }
            status(sessionId) { return this.dispatch('status', sessionId); }
            connect(sessionId) { return this.dispatch('connect', sessionId); }
            disconnect(sessionId) { return this.dispatch('disconnect', sessionId); }
            cancel(sessionId) { return this.dispatch('cancel', sessionId); }
            share(sessionId) { return this.dispatch('share', sessionId); }
        }
        // Standard decorator initialization through the public SDK, without compiler-specific metadata.
        for (const method of ['status', 'connect', 'disconnect', 'cancel', 'share']) {
            Remote(SettingsGateway.prototype[method], {
                kind: 'method', name: method, static: false, private: false, metadata: undefined,
                access: { has: (service) => method in service, get: (service) => service[method] },
                addInitializer: initialize => initializers.push(initialize),
            });
        }
        await host.plugin(SettingsGateway);
    });
}
