// SPDX-License-Identifier: AGPL-3.0-only
import type { Context } from '@deepseek-ai/cordis';
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import type {} from '@deepseek-ai/dsh-api-gateway';
import type { HostControl } from './index.js';
import { createSettingsBridge } from './settings.js';

/** Existing Gateway owns /api; bridge admission requires the real Connection operator on every host. */
export function installSettingsGateway(ctx: Context, control: HostControl) {
  return ctx.inject(['connection', 'typertGateway', 'agents', 'sessionController'], async (host) => {
    const bridge = createSettingsBridge(host, control);
    host.effect(() => () => bridge.dispose(), 'guilduo.settings-gateway');
    const initializers: ((this: SettingsGateway) => void)[] = [];
    class SettingsGateway extends TypertRemoteService {
      constructor(serviceCtx: Context) {
        super(serviceCtx, 'guilduoSettings', { namespace: 'guilduo' });
        for (const initialize of initializers) initialize.call(this);
      }
      private dispatch(action: string, sessionId: string) {
        const invocation = this.ctx.invocation;
        if (!invocation || invocation.peer !== host.connection.operator) {
          return Promise.resolve({ ok: false as const, error: {
            code: 'guilduo/unauthorized', message: 'Guilduo settings require the authenticated operator.', details: {},
          } });
        }
        return bridge.handle(`guilduo/${action}`, { sessionId }, invocation.signal, invocation.peer);
      }
      status(sessionId: string) { return this.dispatch('status', sessionId); }
      connect(sessionId: string) { return this.dispatch('connect', sessionId); }
      disconnect(sessionId: string) { return this.dispatch('disconnect', sessionId); }
      cancel(sessionId: string) { return this.dispatch('cancel', sessionId); }
      share(sessionId: string) { return this.dispatch('share', sessionId); }
    }
    // Standard decorator initialization through the public SDK, without compiler-specific metadata.
    for (const method of ['status', 'connect', 'disconnect', 'cancel', 'share'] as const) {
      Remote(SettingsGateway.prototype[method], {
        kind: 'method', name: method, static: false, private: false, metadata: undefined,
        access: { has: (service: SettingsGateway) => method in service, get: (service: SettingsGateway) => service[method] },
        addInitializer: initialize => initializers.push(initialize),
      });
    }
    await host.plugin(SettingsGateway);
  });
}
