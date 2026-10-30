import { mkdir, open } from "node:fs/promises";
import { join } from "node:path";
import { hashSha256 } from "@pshkv/gate-capability-tokens";

/** A successful consume must be durable before an effect can start. */
export interface EdgeReplayStore {
  consume(dispatchId: string, nonce: string): Promise<boolean> | boolean;
}

export class InMemoryEdgeReplayStore implements EdgeReplayStore {
  private readonly dispatchIds = new Set<string>();
  private readonly nonces = new Set<string>();

  consume(dispatchId: string, nonce: string): boolean {
    if (this.dispatchIds.has(dispatchId) || this.nonces.has(nonce)) return false;
    this.dispatchIds.add(dispatchId);
    this.nonces.add(nonce);
    return true;
  }
}

/**
 * Local, fail-closed replay store. O_EXCL makes nonce consumption atomic across
 * runner processes sharing a directory. The marker is synced before dispatch.
 * Keep this directory on a durable local filesystem, never a temporary mount.
 */
export class FileEdgeReplayStore implements EdgeReplayStore {
  constructor(private readonly directory: string) {}

  async consume(dispatchId: string, nonce: string): Promise<boolean> {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    // Commit the nonce first. If power is lost between markers, the signed
    // envelope's nonce is still spent and the same action cannot be replayed.
    if (!await this.mark(`nonce-${hashSha256(nonce)}`, dispatchId)) return false;
    return this.mark(`dispatch-${hashSha256(dispatchId)}`, nonce);
  }

  private async mark(name: string, value: string): Promise<boolean> {
    const path = join(this.directory, name);
    let file;
    try {
      file = await open(path, "wx", 0o600);
    } catch (cause) {
      if (typeof cause === "object" && cause !== null && "code" in cause && cause.code === "EEXIST") {
        return false;
      }
      throw cause;
    }
    try {
      await file.writeFile(value);
      await file.sync();
    } finally {
      await file.close();
    }
    const directory = await open(this.directory, "r");
    try {
      await directory.sync();
    } finally {
      await directory.close();
    }
    return true;
  }
}
