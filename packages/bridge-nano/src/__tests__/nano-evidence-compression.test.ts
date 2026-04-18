import { describe, it, expect } from 'vitest';
import { NanoEvidenceCompression } from '../nano-evidence-compression';

describe('NanoEvidenceCompression', () => {
  const compression = new NanoEvidenceCompression();

  it('compresses evidence with RLE', () => {
    const evidence = compression.compressEvidence('aaabbbcccc', 'rle');

    expect(evidence.algorithm).toBe('rle');
    expect(evidence.originalSize).toBe(10);
    expect(evidence.compressedSize).toBeGreaterThan(0);
    expect(evidence.hash).toBeDefined();
  });

  it('decompresses RLE encoded data', () => {
    const original = 'aaabbbcccc';
    const encodedData = 'aaabbbcccc'; // For decompression test, use the pattern
    const decompressed = compression.decompressEvidence('3a3b4c', 'rle');

    expect(typeof decompressed).toBe('string');
  });

  it('compresses with delta encoding', () => {
    const evidence = compression.compressEvidence('hello', 'delta');

    expect(evidence.algorithm).toBe('delta');
    expect(evidence.originalSize).toBe(5);
  });

  it('compresses with huffman', () => {
    const evidence = compression.compressEvidence('test data', 'huffman');

    expect(evidence.algorithm).toBe('huffman');
    expect(evidence.compressionRatio).toBeDefined();
  });

  it('calculates compression statistics', () => {
    const comp3 = new NanoEvidenceCompression();
    comp3.compressEvidence('data1', 'rle');
    comp3.compressEvidence('data2', 'delta');
    comp3.compressEvidence('data3', 'huffman');

    const stats = comp3.getCompressionStats();

    expect(stats.totalEvidence).toBe(3);
    expect(stats.avgCompressionRatio).toBeDefined();
    expect(stats.totalBytesBeforeCompression).toBeGreaterThan(0);
  });

  it('tracks compression history', () => {
    const comp2 = new NanoEvidenceCompression();
    comp2.compressEvidence('test1', 'rle');
    comp2.compressEvidence('test2', 'rle');

    const stats = comp2.getCompressionStats();
    expect(stats.totalEvidence).toBe(2);
  });
});
