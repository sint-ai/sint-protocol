import { describe, it, expect } from 'vitest';
import { NanoDeviceManager } from '../nano-device';
import { ApprovalTier } from '@pshkv/core';

describe('NanoDeviceManager', () => {
  const manager = new NanoDeviceManager();

  it('registers nano device with minimal memory (32KB threshold)', () => {
    const device = manager.registerNanoDevice('sensor-1', 'ble-sensor', 16000);

    expect(device.deviceId).toBe('sensor-1');
    expect(device.type).toBe('ble-sensor');
    expect(device.approvalTier).toBe(ApprovalTier.T0_OBSERVE);
    expect(device.batteryPercent).toBe(100);
  });

  it('registers nano device with sufficient memory (32KB+)', () => {
    const device = manager.registerNanoDevice('node-1', 'lora-node', 32000);

    expect(device.approvalTier).toBe(ApprovalTier.T1_PREPARE);
  });

  it('records nano action', () => {
    manager.registerNanoDevice('sensor-2', 'ble-sensor', 16000);
    const action = manager.recordNanoAction('sensor-2', 'temperature-read', 'temp=23.5', false);

    expect(action.deviceId).toBe('sensor-2');
    expect(action.actionType).toBe('temperature-read');
    expect(action.compressed).toBe(false);
  });

  it('updates device state with battery', () => {
    manager.registerNanoDevice('sensor-3', 'zigbee-device', 16000);
    manager.updateDeviceState('sensor-3', 75);

    expect(manager.isBatteryLow('sensor-3')).toBe(false);
  });

  it('detects low battery', () => {
    manager.registerNanoDevice('sensor-4', 'nrf52', 16000);
    manager.updateDeviceState('sensor-4', 15);

    expect(manager.isBatteryLow('sensor-4')).toBe(true);
  });

  it('tracks device as active', () => {
    manager.registerNanoDevice('sensor-5', 'avr-mcu', 16000);

    expect(manager.isDeviceActive('sensor-5')).toBe(true);
  });

  it('detects inactive device after timeout', () => {
    manager.registerNanoDevice('sensor-6', 'ble-sensor', 16000);
    const isActive = manager.isDeviceActive('sensor-6');
    expect(isActive).toBe(true);
  });

  it('compresses actions to base64 string', () => {
    manager.registerNanoDevice('sensor-7', 'ble-sensor', 16000);
    manager.recordNanoAction('sensor-7', 'event-1', 'data1', false);
    manager.recordNanoAction('sensor-7', 'event-2', 'data2', false);

    const compressed = manager.compressActions('sensor-7');
    expect(typeof compressed).toBe('string');
    expect(compressed.length).toBeGreaterThan(0);
  });

  it('returns statistics', () => {
    manager.registerNanoDevice('sensor-8', 'lora-node', 32000);
    manager.registerNanoDevice('sensor-9', 'zigbee-device', 16000);
    manager.updateDeviceState('sensor-8', 85);
    manager.updateDeviceState('sensor-9', 50);

    const stats = manager.getStats();
    expect(stats.totalDevices).toBeGreaterThanOrEqual(2);
    expect(stats.activeDevices).toBeGreaterThanOrEqual(0);
    expect(stats.avgBatteryPercent).toBeGreaterThan(0);
  });

  it('tracks action history', () => {
    manager.registerNanoDevice('sensor-10', 'ble-sensor', 16000);
    manager.recordNanoAction('sensor-10', 'read-1', 'val1', false);
    manager.recordNanoAction('sensor-10', 'read-2', 'val2', false);

    const stats = manager.getStats();
    expect(stats.totalActions).toBeGreaterThanOrEqual(2);
  });
});
