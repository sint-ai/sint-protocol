/**
 * SINT Protocol — SensorBus for System 1 perception.
 *
 * The SensorBus manages sensor registration, ring-buffered data ingestion,
 * and world-state fusion. Each sensor maintains its own ring buffer of
 * readings. The bus fuses the latest readings from all sensors into
 * a unified {@link SintWorldState}.
 *
 * @module @sint/engine-system1/sensor-bus
 */

import type {
  Result,
  SintPerceivedObject,
  SintPose,
  SintSensorReading,
  SintWorldState,
} from "@sint-ai/core";
import { err, ok } from "@sint-ai/core";
import type { SensorSource } from "./types.js";

/**
 * Internal ring buffer entry for a registered sensor.
 */
interface SensorEntry {
  readonly source: SensorSource;
  buffer: SintSensorReading[];
  writeIndex: number;
}

/**
 * Manages sensor registration, buffered reading ingestion, and world-state fusion.
 *
 * Sensors are registered with a fixed-size ring buffer. Readings are pushed
 * into the buffer in O(1) time. The buffer wraps at capacity, overwriting
 * the oldest entries.
 *
 * @example
 * ```ts
 * const bus = new SensorBus();
 * bus.registerSensor({ sensorId: "cam0", modality: "camera_rgb", bufferSize: 50 });
 * bus.pushReading({ sensorId: "cam0", modality: "camera_rgb", timestamp: "2026-03-17T10:00:00.000000Z", data: new Float32Array([1]), confidence: 0.95 });
 * const latest = bus.getLatestReading("cam0");
 * ```
 */
export class SensorBus {
  private readonly sensors: Map<string, SensorEntry> = new Map();

  /**
   * Register a sensor source with a dedicated ring buffer.
   *
   * @param source - Sensor source descriptor including buffer size
   * @returns Ok on success, Error if sensor ID is already registered
   *
   * @example
   * ```ts
   * const result = bus.registerSensor({ sensorId: "lidar0", modality: "lidar", bufferSize: 100 });
   * ```
   */
  registerSensor(source: SensorSource): Result<void, Error> {
    if (this.sensors.has(source.sensorId)) {
      return err(new Error(`Sensor already registered: ${source.sensorId}`));
    }
    this.sensors.set(source.sensorId, {
      source,
      buffer: new Array<SintSensorReading>(source.bufferSize),
      writeIndex: 0,
    });
    return ok(undefined);
  }

  /**
   * Unregister a sensor and discard its buffer.
   *
   * @param sensorId - ID of the sensor to remove
   * @returns Ok on success, Error if sensor ID is not registered
   *
   * @example
   * ```ts
   * bus.unregisterSensor("lidar0");
   * ```
   */
  unregisterSensor(sensorId: string): Result<void, Error> {
    if (!this.sensors.has(sensorId)) {
      return err(new Error(`Sensor not registered: ${sensorId}`));
    }
    this.sensors.delete(sensorId);
    return ok(undefined);
  }

  /**
   * Push a sensor reading into the ring buffer for the reading's sensor.
   *
   * @param reading - The sensor reading to store
   * @returns Ok on success, Error if sensor ID is not registered
   *
   * @example
   * ```ts
   * bus.pushReading({
   *   sensorId: "cam0", modality: "camera_rgb",
   *   timestamp: "2026-03-17T10:00:00.000000Z",
   *   data: new Float32Array([1, 2, 3]),
   *   confidence: 0.9,
   * });
   * ```
   */
  pushReading(reading: SintSensorReading): Result<void, Error> {
    const entry = this.sensors.get(reading.sensorId);
    if (!entry) {
      return err(new Error(`Sensor not registered: ${reading.sensorId}`));
    }
    const idx = entry.writeIndex % entry.source.bufferSize;
    entry.buffer[idx] = reading;
    entry.writeIndex += 1;
    return ok(undefined);
  }

  /**
   * Get the most recent reading for a sensor.
   *
   * @param sensorId - ID of the sensor
   * @returns The latest reading, or null if no readings have been pushed
   *
   * @example
   * ```ts
   * const result = bus.getLatestReading("cam0");
   * if (result.ok && result.value) {
   *   console.log(result.value.confidence);
   * }
   * ```
   */
  getLatestReading(sensorId: string): Result<SintSensorReading | null, Error> {
    const entry = this.sensors.get(sensorId);
    if (!entry) {
      return err(new Error(`Sensor not registered: ${sensorId}`));
    }
    if (entry.writeIndex === 0) {
      return ok(null);
    }
    const idx = (entry.writeIndex - 1) % entry.source.bufferSize;
    const reading = entry.buffer[idx];
    return ok(reading ?? null);
  }

  /**
   * Get the last N readings for a sensor, ordered oldest-to-newest.
   *
   * @param sensorId - ID of the sensor
   * @param count - Maximum number of readings to return (defaults to buffer size)
   * @returns Array of readings ordered oldest-to-newest
   *
   * @example
   * ```ts
   * const result = bus.getReadings("cam0", 10);
   * if (result.ok) {
   *   console.log(`Got ${result.value.length} readings`);
   * }
   * ```
   */
  getReadings(sensorId: string, count?: number): Result<readonly SintSensorReading[], Error> {
    const entry = this.sensors.get(sensorId);
    if (!entry) {
      return err(new Error(`Sensor not registered: ${sensorId}`));
    }
    const totalWritten = entry.writeIndex;
    const bufferSize = entry.source.bufferSize;
    const available = Math.min(totalWritten, bufferSize);
    const requestCount = count !== undefined ? Math.min(count, available) : available;

    const readings: SintSensorReading[] = [];
    for (let i = requestCount; i > 0; i--) {
      const idx = (totalWritten - i) % bufferSize;
      const reading = entry.buffer[idx];
      if (reading !== undefined) {
        readings.push(reading);
      }
    }
    return ok(readings);
  }

  /**
   * List all registered sensor IDs.
   *
   * @returns Array of registered sensor ID strings
   *
   * @example
   * ```ts
   * const ids = bus.getSensorIds();
   * // ["cam0", "lidar0"]
   * ```
   */
  getSensorIds(): readonly string[] {
    return Array.from(this.sensors.keys());
  }

  /**
   * Fuse the latest readings from all sensors into a unified world state.
   *
   * This is a simplified fusion that extracts objects with confidence
   * from each sensor reading's data field (if it contains perceived objects),
   * determines a default robot pose, and sets anomaly flags to empty.
   * Full fusion with neural inference is handled by the PerceptionPipeline.
   *
   * @returns A fused SintWorldState from all current sensor data
   *
   * @example
   * ```ts
   * const result = bus.fuseWorldState();
   * if (result.ok) {
   *   console.log(`${result.value.objects.length} objects detected`);
   * }
   * ```
   */
  fuseWorldState(): Result<SintWorldState, Error> {
    const objects: SintPerceivedObject[] = [];
    let humanPresent = false;
    let latestTimestamp = new Date(0).toISOString() as string;

    for (const entry of this.sensors.values()) {
      if (entry.writeIndex === 0) {
        continue;
      }
      const idx = (entry.writeIndex - 1) % entry.source.bufferSize;
      const reading = entry.buffer[idx];
      if (!reading) {
        continue;
      }
      if (reading.timestamp > latestTimestamp) {
        latestTimestamp = reading.timestamp;
      }

      // Extract perceived objects if data contains them
      if (Array.isArray(reading.data)) {
        for (const item of reading.data) {
          if (isPerceivedObject(item)) {
            objects.push(item);
            if (item.isHuman) {
              humanPresent = true;
            }
          }
        }
      }
    }

    // Use current time if no readings have timestamps
    if (latestTimestamp === new Date(0).toISOString()) {
      latestTimestamp = new Date().toISOString();
    }

    const defaultPose: SintPose = {
      position: { x: 0, y: 0, z: 0 },
      orientation: { roll: 0, pitch: 0, yaw: 0 },
    };

    const worldState: SintWorldState = {
      timestamp: latestTimestamp,
      objects,
      robotPose: defaultPose,
      anomalyFlags: [],
      humanPresent,
    };

    return ok(worldState);
  }
}

/**
 * Type guard for SintPerceivedObject shape.
 */
function isPerceivedObject(value: unknown): value is SintPerceivedObject {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const obj = value as Record<string, unknown>;
  return (
    typeof obj["classLabel"] === "string" &&
    typeof obj["confidence"] === "number" &&
    typeof obj["isHuman"] === "boolean" &&
    typeof obj["boundingBox3D"] === "object" &&
    obj["boundingBox3D"] !== null
  );
}
