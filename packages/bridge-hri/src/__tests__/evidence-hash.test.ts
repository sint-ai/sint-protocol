import { describe, it, expect } from 'vitest';
import { HRIEvidenceHash } from '../evidence-hash';

describe('HRIEvidenceHash', () => {
  const hasher = new HRIEvidenceHash();

  it('records evidence entry', () => {
    const entry = hasher.recordEvidence('voice', 'yes, I approve', new Date());

    expect(entry.modality).toBe('voice');
    expect(entry.hash).toBeDefined();
    expect(entry.previousHash).toBe('0');
    expect(entry.dataSize).toBeGreaterThan(0);
  });

  it('creates chain with previous hash', () => {
    const hasher2 = new HRIEvidenceHash();
    const entry1 = hasher2.recordEvidence('voice', 'yes', new Date());
    const entry2 = hasher2.recordEvidence('gesture', 'thumbs-up', new Date());

    expect(entry2.previousHash).toBe(entry1.hash);
  });

  it('verifies chain integrity when valid', () => {
    const hasher3 = new HRIEvidenceHash();
    hasher3.recordEvidence('voice', 'yes', new Date());
    hasher3.recordEvidence('gesture', 'nod', new Date());
    hasher3.recordEvidence('gaze', 'fixation', new Date());

    expect(hasher3.verifyChainIntegrity()).toBe(true);
  });

  it('retrieves chain entries', () => {
    const hasher4 = new HRIEvidenceHash();
    hasher4.recordEvidence('voice', 'test1', new Date());
    hasher4.recordEvidence('gesture', 'test2', new Date());

    const chain = hasher4.getChain();
    expect(chain).toHaveLength(2);
    expect(chain[0]!.modality).toBe('voice');
    expect(chain[1]!.modality).toBe('gesture');
  });

  it('gets last entry', () => {
    const hasher5 = new HRIEvidenceHash();
    const entry1 = hasher5.recordEvidence('voice', 'first', new Date());
    const entry2 = hasher5.recordEvidence('gesture', 'second', new Date());

    const last = hasher5.getLastEntry();
    expect(last?.hash).toBe(entry2.hash);
    expect(last?.modality).toBe('gesture');
  });

  it('records buffer data', () => {
    const hasher6 = new HRIEvidenceHash();
    const buffer = Buffer.from('test data');
    const entry = hasher6.recordEvidence('audio', buffer, new Date());

    expect(entry.dataSize).toBe(buffer.length);
  });

  it('generates unique hashes for different data', () => {
    const hasher7 = new HRIEvidenceHash();
    const entry1 = hasher7.recordEvidence('voice', 'yes', new Date());
    const hasher8 = new HRIEvidenceHash();
    const entry2 = hasher8.recordEvidence('voice', 'no', new Date());

    expect(entry1.hash).not.toBe(entry2.hash);
  });

  it('handles empty chain verification', () => {
    const hasher9 = new HRIEvidenceHash();
    expect(hasher9.verifyChainIntegrity()).toBe(true);
  });
});
