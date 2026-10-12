/** One empty server-owned transaction, never a snapshot, user ID or staged write. */
export class PreparedTransaction {
  private ready?: { id: string; expiresAt: number };
  private preparing = false;

  constructor(private readonly now: () => number = Date.now) {}

  async prepare(create: () => Promise<string>): Promise<void> {
    if (this.preparing || (this.ready && this.ready.expiresAt > this.now())) return;
    this.ready = undefined;
    this.preparing = true;
    // The service TTL is 60s. Use only the first 30s, including creation time,
    // leaving at least 30s for the normal stage/commit path.
    const expiresAt = this.now() + 30_000;
    try {
      const id = await create();
      if (this.now() < expiresAt) this.ready = { id, expiresAt };
    } catch {
      // Preparation is optional; the actual save creates its own transaction.
      // Never retain a rejected promise or retry an uncertain operation here.
    } finally { this.preparing = false; }
  }

  take(): string | undefined {
    const candidate = this.ready;
    this.ready = undefined; // Claim synchronously, before any request can await.
    return candidate && this.now() < candidate.expiresAt ? candidate.id : undefined;
  }
}
