/**
 * SINT Protocol — Engine configuration loader.
 *
 * Loads, validates, and merges engine configuration from a JSON file.
 * Falls back to sensible defaults when no configuration file is found.
 *
 * @module @sint/engine-hal/config
 */

import { readFile } from "node:fs/promises";

import { ok, err } from "@sint-ai/core";
import type { Result } from "@sint-ai/core";
import { z } from "zod";

import type { EngineConfig } from "./types.js";
import { DEFAULT_THRESHOLDS } from "./types.js";

/** Default configuration file path. */
const DEFAULT_CONFIG_PATH = "./sint-engine.config.json";

/** Zod schema for validating engine configuration. */
const engineConfigSchema = z.object({
  deploymentProfile: z
    .enum(["full", "edge", "split", "lite"])
    .optional(),
  resourceThresholds: z
    .object({
      cpuWarningPercent: z.number().min(0).max(100).optional(),
      cpuCriticalPercent: z.number().min(0).max(100).optional(),
      memoryWarningPercent: z.number().min(0).max(100).optional(),
      memoryCriticalPercent: z.number().min(0).max(100).optional(),
    })
    .strict()
    .optional(),
  samplingIntervalMs: z.number().int().positive().optional(),
});

/**
 * Load engine configuration from a JSON file.
 *
 * Reads the specified configuration file (or the default path),
 * validates it against the schema, and merges resource thresholds
 * with defaults. If the file does not exist, returns an empty
 * configuration with default thresholds applied.
 *
 * @param configPath - Path to the configuration JSON file (default: `./sint-engine.config.json`)
 * @returns A Result containing the validated and merged engine configuration
 *
 * @example
 * ```ts
 * const result = await loadEngineConfig();
 * if (result.ok) {
 *   console.log(result.value.deploymentProfile); // "edge" or undefined
 * }
 * ```
 *
 * @example
 * ```ts
 * const result = await loadEngineConfig("/etc/sint/engine.json");
 * if (!result.ok) {
 *   console.error(result.error.message);
 * }
 * ```
 */
export async function loadEngineConfig(
  configPath?: string,
): Promise<Result<EngineConfig, Error>> {
  const filePath = configPath ?? DEFAULT_CONFIG_PATH;

  let rawJson: string;
  try {
    rawJson = await readFile(filePath, "utf-8");
  } catch (error: unknown) {
    // File not found is acceptable — return empty config with defaults
    if (isNodeError(error) && error.code === "ENOENT") {
      return ok({
        resourceThresholds: { ...DEFAULT_THRESHOLDS },
      });
    }
    const message = error instanceof Error ? error.message : String(error);
    return err(new Error(`Failed to read config file: ${message}`));
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    return err(new Error(`Invalid JSON in config file: ${filePath}`));
  }

  const validation = engineConfigSchema.safeParse(parsed);
  if (!validation.success) {
    return err(
      new Error(`Invalid config: ${validation.error.issues.map((i) => i.message).join(", ")}`),
    );
  }

  const validated = validation.data;

  const config: EngineConfig = {
    deploymentProfile: validated.deploymentProfile,
    resourceThresholds: {
      ...DEFAULT_THRESHOLDS,
      ...validated.resourceThresholds,
    },
    samplingIntervalMs: validated.samplingIntervalMs,
  };

  return ok(config);
}

/**
 * Type guard for Node.js system errors that include a `code` property.
 */
function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
