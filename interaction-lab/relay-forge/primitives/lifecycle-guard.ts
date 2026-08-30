/**
 * A "disposed generation token" for a mounted Shell instance. An async
 * background operation started before unmount (an avatar `fetch`, most
 * notably — see shell.ts's `refreshAgentAvatars`) can still resolve after
 * `dispose()` runs. Every point where such a result would otherwise mutate
 * shared state, create a Blob URL, or trigger a render must check
 * `.disposed` first and bail out instead.
 */
export interface LifecycleGuard {
  readonly disposed: boolean;
  dispose(): void;
}

export type LifecycleStepResult<T> =
  | { readonly status: "active"; readonly value: T }
  | { readonly status: "disposed" };

export function createLifecycleGuard(): LifecycleGuard {
  let disposed = false;
  return {
    get disposed(): boolean {
      return disposed;
    },
    dispose(): void {
      disposed = true;
    },
  };
}

/**
 * Runs one async stage only while its owning mount is active, then checks the
 * same generation again after the await. Multi-stage flows call this once per
 * stage, preventing a disposed mount from starting the next side effect or
 * applying a result that arrived after unmount.
 */
export async function runLifecycleStep<T>(
  lifecycle: LifecycleGuard,
  operation: () => Promise<T>,
): Promise<LifecycleStepResult<T>> {
  if (lifecycle.disposed) return { status: "disposed" };
  const value = await operation();
  return lifecycle.disposed ? { status: "disposed" } : { status: "active", value };
}
