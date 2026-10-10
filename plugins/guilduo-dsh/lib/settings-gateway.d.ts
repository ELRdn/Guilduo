import type { Context } from '@deepseek-ai/cordis';
import type { HostControl } from './index.js';
/** Existing Gateway owns /api; bridge admission requires the real Connection operator on every host. */
export declare function installSettingsGateway(ctx: Context, control: HostControl): import("@deepseek-ai/cordis").Fiber & PromiseLike<import("@deepseek-ai/cordis").Fiber>;
