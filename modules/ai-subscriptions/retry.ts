export type Payload = Record<string, string | number | boolean | null>;

/** Retains identity until success; a network failure may occur after the server has stored the record. */
export class MutationAttempt {
  private last: { fingerprint: string; key: string } | null = null;
  constructor(private readonly newKey: () => string = () => crypto.randomUUID()) {}

  prepare(payload: Payload): Payload {
    if ('record_id' in payload || payload.action === 'adopt') return { ...payload };
    const fingerprint = JSON.stringify(payload);
    if (!this.last || this.last.fingerprint !== fingerprint) this.last = { fingerprint, key: this.newKey() };
    return { ...payload, idempotency_key: this.last.key };
  }

  succeeded() { this.last = null; }
}
