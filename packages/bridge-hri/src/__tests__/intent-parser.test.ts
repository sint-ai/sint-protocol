import { describe, it, expect } from 'vitest';
import { OnDeviceIntentParser } from '../intent-parser';

describe('OnDeviceIntentParser', () => {
  const parser = new OnDeviceIntentParser();

  it('parses turn on command', () => {
    const intent = parser.parseCommand('turn on bedroom light');

    expect(intent.action).toBe('turn-on');
    expect(intent.target).toBe('bedroom light');
    expect(intent.confidence).toBeGreaterThan(0.9);
  });

  it('parses turn off command', () => {
    const intent = parser.parseCommand('turn off kitchen light');

    expect(intent.action).toBe('turn-off');
    expect(intent.target).toBe('kitchen light');
  });

  it('parses open command', () => {
    const intent = parser.parseCommand('open garage door');

    expect(intent.action).toBe('open');
    expect(intent.target).toBe('garage door');
  });

  it('parses set command with value', () => {
    const intent = parser.parseCommand('set thermostat to 72');

    expect(intent.action).toBe('set');
    expect(intent.target).toBe('thermostat');
    expect(intent.parameters.value).toBe(72);
  });

  it('parses start command', () => {
    const intent = parser.parseCommand('start washing machine');

    expect(intent.action).toBe('start');
    expect(intent.target).toBe('washing machine');
  });

  it('parses stop command', () => {
    const intent = parser.parseCommand('stop the dishwasher');

    expect(intent.action).toBe('stop');
    expect(intent.target).toBe('the dishwasher');
  });

  it('handles unknown commands', () => {
    const intent = parser.parseCommand('do something random');

    expect(intent.action).toBe('unknown');
    expect(intent.confidence).toBe(0);
  });

  it('is case insensitive', () => {
    const intent1 = parser.parseCommand('TURN ON bedroom light');
    const intent2 = parser.parseCommand('turn on bedroom light');

    expect(intent1.action).toBe(intent2.action);
    expect(intent1.target).toBe(intent2.target);
  });

  it('trims whitespace from targets', () => {
    const intent = parser.parseCommand('turn on   bedroom   light  ');

    expect(intent.target).toBe('bedroom   light');
  });

  it('parses lock command', () => {
    const intent = parser.parseCommand('lock front door');

    expect(intent.action).toBe('lock');
    expect(intent.target).toBe('front door');
  });

  it('parses unlock command', () => {
    const intent = parser.parseCommand('unlock garage');

    expect(intent.action).toBe('unlock');
    expect(intent.target).toBe('garage');
  });
});
