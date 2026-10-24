import {
  err,
  ok,
  type Result,
  type SHA256,
  type SimulationArtifact,
  type SimulationArtifactStore,
  type SimulationArtifactStoreError,
  type StoredSimulationArtifact,
} from "@pshkv/core";
import { hashSha256 } from "@pshkv/gate-capability-tokens";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { randomBytes } from "node:crypto";

function stored(artifact: SimulationArtifact): StoredSimulationArtifact {
  return {
    digest: hashSha256(artifact.content),
    mediaType: artifact.mediaType,
    sizeBytes: new TextEncoder().encode(artifact.content).byteLength,
  };
}

/** Deterministic reference store for tests and single-process development. */
export class InMemorySimulationArtifactStore implements SimulationArtifactStore {
  private readonly artifacts = new Map<SHA256, SimulationArtifact>();

  async put(artifact: SimulationArtifact): Promise<Result<StoredSimulationArtifact, SimulationArtifactStoreError>> {
    const metadata = stored(artifact);
    this.artifacts.set(metadata.digest, Object.freeze({ ...artifact }));
    return ok(metadata);
  }

  async get(digest: SHA256): Promise<Result<SimulationArtifact, SimulationArtifactStoreError>> {
    const artifact = this.artifacts.get(digest);
    return artifact
      ? ok(artifact)
      : err({ code: "ARTIFACT_NOT_FOUND", message: `No simulation artifact exists for digest ${digest}` });
  }
}

interface ArtifactEnvelope {
  readonly schemaVersion: "1.0.0";
  readonly digest: SHA256;
  readonly mediaType: string;
  readonly content: string;
}

/**
 * Durable filesystem content-addressed store.
 *
 * Objects are sharded by digest prefix and written through an atomic rename.
 * The digest is rechecked on read so disk corruption fails closed.
 */
export class FileSystemSimulationArtifactStore implements SimulationArtifactStore {
  private readonly root: string;

  constructor(rootDirectory: string) {
    this.root = resolve(rootDirectory);
  }

  async put(artifact: SimulationArtifact): Promise<Result<StoredSimulationArtifact, SimulationArtifactStoreError>> {
    const metadata = stored(artifact);
    const directory = join(this.root, metadata.digest.slice(0, 2));
    const path = join(directory, `${metadata.digest}.json`);
    const temporaryPath = join(
      directory,
      `.${metadata.digest}.${randomBytes(8).toString("hex")}.tmp`,
    );
    const envelope: ArtifactEnvelope = {
      schemaVersion: "1.0.0",
      digest: metadata.digest,
      mediaType: artifact.mediaType,
      content: artifact.content,
    };

    try {
      await mkdir(directory, { recursive: true });
      await writeFile(temporaryPath, JSON.stringify(envelope), { encoding: "utf8", flag: "wx" });
      await rename(temporaryPath, path);
      return ok(metadata);
    } catch (cause) {
      return err({
        code: "ARTIFACT_WRITE_FAILED",
        message: `Failed to persist simulation artifact ${metadata.digest}: ${cause instanceof Error ? cause.message : "unknown I/O error"}`,
      });
    }
  }

  async get(digest: SHA256): Promise<Result<SimulationArtifact, SimulationArtifactStoreError>> {
    const path = join(this.root, digest.slice(0, 2), `${digest}.json`);
    try {
      const serialized = await readFile(path, "utf8");
      const parsed = JSON.parse(serialized) as Partial<ArtifactEnvelope>;
      if (
        parsed.schemaVersion !== "1.0.0"
        || parsed.digest !== digest
        || typeof parsed.mediaType !== "string"
        || typeof parsed.content !== "string"
        || hashSha256(parsed.content) !== digest
      ) {
        return err({ code: "ARTIFACT_CORRUPTED", message: `Artifact ${digest} failed integrity verification` });
      }
      return ok({ mediaType: parsed.mediaType, content: parsed.content });
    } catch (cause) {
      const code = cause && typeof cause === "object" && "code" in cause && cause.code === "ENOENT"
        ? "ARTIFACT_NOT_FOUND"
        : "ARTIFACT_READ_FAILED";
      return err({
        code,
        message: code === "ARTIFACT_NOT_FOUND"
          ? `No simulation artifact exists for digest ${digest}`
          : `Failed to read simulation artifact ${digest}: ${cause instanceof Error ? cause.message : "unknown I/O error"}`,
      });
    }
  }
}
