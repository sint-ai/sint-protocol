import { createHash } from 'crypto';

export interface HRIEvidenceEntry {
  hash: string;
  previousHash: string;
  modality: string;
  timestamp: Date;
  dataSize: number;
}

export class HRIEvidenceHash {
  private chain: HRIEvidenceEntry[] = [];
  private lastHash = '0';

  recordEvidence(modality: string, rawData: Buffer | string, timestamp: Date): HRIEvidenceEntry {
    const dataBuffer = typeof rawData === 'string' ? Buffer.from(rawData) : rawData;
    const hash = this.generateHash(modality, dataBuffer, timestamp);

    const entry: HRIEvidenceEntry = {
      hash,
      previousHash: this.lastHash,
      modality,
      timestamp,
      dataSize: dataBuffer.length,
    };

    this.chain.push(entry);
    this.lastHash = hash;

    return entry;
  }

  private generateHash(modality: string, data: Buffer, timestamp: Date): string {
    const combined = `${modality}:${data.toString('hex')}:${timestamp.toISOString()}:${this.lastHash}`;
    return createHash('sha256').update(combined).digest('hex');
  }

  verifyChainIntegrity(): boolean {
    if (this.chain.length === 0) return true;

    let expectedPrevious = '0';
    for (const entry of this.chain) {
      if (entry.previousHash !== expectedPrevious) {
        return false;
      }
      expectedPrevious = entry.hash;
    }

    return true;
  }

  getChain(): HRIEvidenceEntry[] {
    return [...this.chain];
  }

  getLastEntry(): HRIEvidenceEntry | undefined {
    return this.chain[this.chain.length - 1];
  }
}
