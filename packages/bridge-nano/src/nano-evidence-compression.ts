import { createHash } from 'crypto';

export type CompressionAlgorithm = 'rle' | 'delta' | 'huffman';

export interface CompressedEvidence {
  algorithm: CompressionAlgorithm;
  originalSize: number;
  compressedSize: number;
  compressionRatio?: number;
  hash: string;
  timestamp: Date;
}

export interface CompressionStats {
  totalEvidence: number;
  totalBytesBeforeCompression: number;
  totalBytesAfterCompression: number;
  avgCompressionRatio: number;
}

export class NanoEvidenceCompression {
  private evidence: CompressedEvidence[] = [];

  compressEvidence(data: string, algorithm: CompressionAlgorithm): CompressedEvidence {
    const originalSize = data.length;
    let compressedData: string;

    switch (algorithm) {
      case 'rle':
        compressedData = this.runLengthEncode(data);
        break;
      case 'delta':
        compressedData = this.deltaEncode(data);
        break;
      case 'huffman':
        compressedData = this.huffmanEncode(data);
        break;
    }

    const hash = this.hashData(compressedData);
    const compressedSize = compressedData.length;
    const compressionRatio = originalSize > 0 ? compressedSize / originalSize : 1;

    const evidence: CompressedEvidence = {
      algorithm,
      originalSize,
      compressedSize,
      compressionRatio,
      hash,
      timestamp: new Date(),
    };

    this.evidence.push(evidence);
    return evidence;
  }

  decompressEvidence(data: string, algorithm: CompressionAlgorithm): string {
    switch (algorithm) {
      case 'rle':
        return this.runLengthDecode(data);
      case 'delta':
        return this.deltaDecode(data);
      case 'huffman':
        return this.huffmanDecode(data);
    }
  }

  private runLengthEncode(data: string): string {
    if (!data) return '';
    let encoded = '';
    let count = 1;

    for (let i = 0; i < data.length; i++) {
      if (i + 1 < data.length && data[i] === data[i + 1]) {
        count++;
      } else {
        encoded += count + data[i]!;
        count = 1;
      }
    }

    return encoded;
  }

  private runLengthDecode(data: string): string {
    let decoded = '';
    let i = 0;

    while (i < data.length) {
      let count = '';
      while (i < data.length && /\d/.test(data[i]!)) {
        count += data[i];
        i++;
      }

      const char = data[i];
      decoded += char!.repeat(parseInt(count, 10));
      i++;
    }

    return decoded;
  }

  private deltaEncode(data: string): string {
    let encoded = '';
    let prev = 0;

    for (let i = 0; i < data.length; i++) {
      const code = data.charCodeAt(i);
      const delta = code - prev;
      encoded += String.fromCharCode(delta);
      prev = code;
    }

    return encoded;
  }

  private deltaDecode(data: string): string {
    let decoded = '';
    let prev = 0;

    for (let i = 0; i < data.length; i++) {
      const delta = data.charCodeAt(i);
      const code = prev + delta;
      decoded += String.fromCharCode(code);
      prev = code;
    }

    return decoded;
  }

  private huffmanEncode(data: string): string {
    const freq = new Map<string, number>();
    for (const char of data) {
      freq.set(char, (freq.get(char) || 0) + 1);
    }

    return Buffer.from(data).toString('base64');
  }

  private huffmanDecode(data: string): string {
    return Buffer.from(data, 'base64').toString('utf-8');
  }

  private hashData(data: string): string {
    return createHash('sha256').update(data).digest('hex');
  }

  getCompressionStats(): CompressionStats {
    let totalBefore = 0;
    let totalAfter = 0;

    this.evidence.forEach((e) => {
      totalBefore += e.originalSize;
      totalAfter += e.compressedSize;
    });

    const avgRatio = this.evidence.length > 0 ? totalAfter / totalBefore : 1;

    return {
      totalEvidence: this.evidence.length,
      totalBytesBeforeCompression: totalBefore,
      totalBytesAfterCompression: totalAfter,
      avgCompressionRatio: avgRatio,
    };
  }
}
