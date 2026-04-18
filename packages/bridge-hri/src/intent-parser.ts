export interface ParsedIntent {
  action: string;
  target: string;
  parameters: Record<string, unknown>;
  confidence: number;
}

export class OnDeviceIntentParser {
  parseCommand(text: string): ParsedIntent {
    const patterns: Array<[RegExp, (match: RegExpMatchArray) => ParsedIntent]> = [
      [/^(turn on|turn off|open|close|lock|unlock)\s+(.+)$/i, (m) => this.buildSimpleActionIntent(m[1]!, m[2]!)],
      [/^set\s+(.+?)\s+to\s+(\d+)$/i, (m) => this.buildSetIntent(m[1]!, m[2]!)],
      [/^(start|stop)\s+(.+)$/i, (m) => this.buildToggleIntent(m[1]!, m[2]!)],
    ];

    for (const [pattern, builder] of patterns) {
      const match = text.match(pattern);
      if (match) {
        return builder(match);
      }
    }

    return { action: 'unknown', target: text, parameters: {}, confidence: 0 };
  }

  private buildSimpleActionIntent(action: string, target: string): ParsedIntent {
    const normalizedAction = action.toLowerCase().replace(' ', '-');
    return {
      action: normalizedAction,
      target: target.trim().toLowerCase(),
      parameters: {},
      confidence: 0.95,
    };
  }

  private buildSetIntent(target: string, value: string): ParsedIntent {
    return {
      action: 'set',
      target: target.trim().toLowerCase(),
      parameters: { value: parseInt(value, 10) },
      confidence: 0.9,
    };
  }

  private buildToggleIntent(action: string, target: string): ParsedIntent {
    const normalizedAction = action.toLowerCase();
    return {
      action: normalizedAction,
      target: target.trim().toLowerCase(),
      parameters: {},
      confidence: 0.92,
    };
  }
}
