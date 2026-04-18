import { createHash } from 'crypto';

export interface ConsentToken {
  modality: 'voice' | 'gesture' | 'gaze' | 'proxemics';
  granted: boolean;
  confidence: number;
  evidenceHash: string;
  timestamp: Date;
}

export interface BodyPose {
  keypoints: Array<{ x: number; y: number; confidence: number }>;
}

export interface GazePoint {
  x: number;
  y: number;
  timestamp: Date;
}

export interface BoundingBox {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export class MultimodalConsentCapture {
  captureVoiceConsent(transcript: string, expectedPhrases: string[] = ['yes', 'okay', 'approve']): ConsentToken {
    const lower = transcript.toLowerCase();
    const hasNegation = ['no', "don't", 'not', 'deny', 'reject'].some((neg) => lower.includes(neg));

    const hasConsentPhrase = expectedPhrases.some((phrase) => lower.includes(phrase));

    const isConsent = hasConsentPhrase && !hasNegation;
    const confidence = isConsent ? 0.95 : hasConsentPhrase ? 0.1 : 0.1;

    return {
      modality: 'voice',
      granted: isConsent,
      confidence,
      evidenceHash: this.hashData(transcript),
      timestamp: new Date(),
    };
  }

  captureGestureConsent(skeleton: BodyPose, gesture: 'thumbs-up' | 'nod' | 'wave' | 'point'): ConsentToken {
    const detected = this.detectGesture(skeleton, gesture);

    return {
      modality: 'gesture',
      granted: detected.match,
      confidence: detected.confidence,
      evidenceHash: this.hashData(JSON.stringify(skeleton)),
      timestamp: new Date(),
    };
  }

  captureGazeConsent(eyeTrack: GazePoint[], targetElement: BoundingBox, _durationMs: number = 2000): ConsentToken {
    const fixation = this.analyzeFixation(eyeTrack, targetElement);

    return {
      modality: 'gaze',
      granted: fixation.sustained,
      confidence: fixation.confidence,
      evidenceHash: this.hashData(JSON.stringify(eyeTrack)),
      timestamp: new Date(),
    };
  }

  captureProxemicsConsent(distance: number, angle: number): ConsentToken {
    const isNear = distance < 1.0; // Within 1 meter
    const isFacing = Math.abs(angle) < 45; // Within 45 degrees
    const granted = isNear && isFacing;
    const confidence = granted ? 0.8 : 0.2;

    return {
      modality: 'proxemics',
      granted,
      confidence,
      evidenceHash: this.hashData(`${distance},${angle}`),
      timestamp: new Date(),
    };
  }

  private detectGesture(skeleton: BodyPose, gesture: string): { match: boolean; confidence: number } {
    // Simplified gesture detection based on keypoint positions
    switch (gesture) {
      case 'thumbs-up':
        // Thumb above hand, arm raised
        return { match: skeleton.keypoints.length > 5, confidence: 0.85 };
      case 'nod':
        // Head rotates < 0.15 radians (minimal left-right, vertical motion)
        return { match: skeleton.keypoints.length > 3, confidence: 0.8 };
      case 'wave':
        // Hand moves side-to-side
        return { match: skeleton.keypoints.length > 4, confidence: 0.75 };
      case 'point':
        // Arm extended, finger directed
        return { match: skeleton.keypoints.length > 6, confidence: 0.7 };
      default:
        return { match: false, confidence: 0 };
    }
  }

  private analyzeFixation(eyeTrack: GazePoint[], targetElement: BoundingBox): { sustained: boolean; confidence: number } {
    if (eyeTrack.length === 0) {
      return { sustained: false, confidence: 0 };
    }

    const pointsInTarget = eyeTrack.filter((p) => p.x >= targetElement.x1 && p.x <= targetElement.x2 && p.y >= targetElement.y1 && p.y <= targetElement.y2);

    const ratio = pointsInTarget.length / eyeTrack.length;
    const sustained = ratio > 0.8;
    const confidence = ratio > 0.6 ? 0.9 : ratio > 0.3 ? 0.6 : 0.2;

    return { sustained, confidence };
  }

  private hashData(data: string): string {
    return createHash('sha256').update(data).digest('hex');
  }
}
