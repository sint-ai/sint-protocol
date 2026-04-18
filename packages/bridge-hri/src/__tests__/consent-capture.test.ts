import { describe, it, expect } from 'vitest';
import { MultimodalConsentCapture } from '../consent-capture';

describe('MultimodalConsentCapture', () => {
  const capture = new MultimodalConsentCapture();

  it('captures voice consent with affirmative response', () => {
    const token = capture.captureVoiceConsent('yes, I approve');

    expect(token.modality).toBe('voice');
    expect(token.granted).toBe(true);
    expect(token.confidence).toBeGreaterThan(0.9);
    expect(token.evidenceHash).toBeDefined();
  });

  it('captures voice consent with denial', () => {
    const token = capture.captureVoiceConsent('no, I do not approve');

    expect(token.granted).toBe(false);
    expect(token.confidence).toBeLessThan(0.5);
  });

  it('captures gesture consent for thumbs-up', () => {
    const skeleton = {
      keypoints: Array.from({ length: 10 }, (_, i) => ({
        x: Math.random(),
        y: Math.random(),
        confidence: 0.9,
      })),
    };

    const token = capture.captureGestureConsent(skeleton, 'thumbs-up');

    expect(token.modality).toBe('gesture');
    expect(token.granted).toBe(true);
    expect(token.confidence).toBeGreaterThan(0.7);
  });

  it('captures gesture consent for nod', () => {
    const skeleton = {
      keypoints: Array.from({ length: 5 }, (_, i) => ({
        x: 0.5,
        y: 0.5 + i * 0.01,
        confidence: 0.95,
      })),
    };

    const token = capture.captureGestureConsent(skeleton, 'nod');

    expect(token.modality).toBe('gesture');
    expect(token.confidence).toBeGreaterThan(0.7);
  });

  it('captures gaze consent with sustained fixation', () => {
    const eyeTrack = Array.from({ length: 10 }, (_, i) => ({
      x: 0.5,
      y: 0.5,
      timestamp: new Date(Date.now() + i * 100),
    }));

    const targetElement = { x1: 0.3, y1: 0.3, x2: 0.7, y2: 0.7 };

    const token = capture.captureGazeConsent(eyeTrack, targetElement, 1000);

    expect(token.modality).toBe('gaze');
    expect(token.granted).toBe(true);
    expect(token.confidence).toBeGreaterThan(0.8);
  });

  it('captures gaze consent with scattered fixation', () => {
    const eyeTrack = Array.from({ length: 10 }, (_, i) => ({
      x: Math.random(),
      y: Math.random(),
      timestamp: new Date(Date.now() + i * 100),
    }));

    const targetElement = { x1: 0.3, y1: 0.3, x2: 0.7, y2: 0.7 };

    const token = capture.captureGazeConsent(eyeTrack, targetElement, 1000);

    expect(token.granted).toBe(false);
  });

  it('captures proxemics consent when near and facing', () => {
    const token = capture.captureProxemicsConsent(0.5, 30);

    expect(token.modality).toBe('proxemics');
    expect(token.granted).toBe(true);
    expect(token.confidence).toBeGreaterThan(0.7);
  });

  it('denies proxemics consent when far', () => {
    const token = capture.captureProxemicsConsent(2.0, 20);

    expect(token.granted).toBe(false);
  });

  it('denies proxemics consent when not facing', () => {
    const token = capture.captureProxemicsConsent(0.5, 90);

    expect(token.granted).toBe(false);
  });

  it('generates consistent evidence hashes', () => {
    const token1 = capture.captureVoiceConsent('yes');
    const token2 = capture.captureVoiceConsent('yes');

    expect(token1.evidenceHash).toBe(token2.evidenceHash);
  });
});
