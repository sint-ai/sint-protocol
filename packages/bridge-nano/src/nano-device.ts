import { ApprovalTier } from '@pshkv/core';

export type NanoDeviceType = 'ble-sensor' | 'zigbee-device' | 'lora-node' | 'nrf52' | 'avr-mcu';

export interface NanoAction {
  actionId: string;
  deviceId: string;
  timestamp: Date;
  actionType: string;
  compressed: boolean;
  compressedData?: string;
}

export interface NanoDeviceState {
  deviceId: string;
  type: NanoDeviceType;
  batteryPercent: number;
  isActive: boolean;
  approvalTier: ApprovalTier;
  lastSeen: Date;
  memoryBytes: number;
}

export interface NanoDeviceStats {
  totalDevices: number;
  activeDevices: number;
  totalActions: number;
  avgBatteryPercent: number;
}

export class NanoDeviceManager {
  private devices = new Map<string, NanoDeviceState>();
  private actions = new Map<string, NanoAction[]>();
  private readonly INACTIVE_THRESHOLD_MS = 300000; // 5 minutes
  private readonly BATTERY_LOW_THRESHOLD = 20;

  registerNanoDevice(deviceId: string, type: NanoDeviceType, memoryBytes: number): NanoDeviceState {
    const approvalTier = memoryBytes >= 32000 ? ApprovalTier.T1_PREPARE : ApprovalTier.T0_OBSERVE;

    const state: NanoDeviceState = {
      deviceId,
      type,
      batteryPercent: 100,
      isActive: true,
      approvalTier,
      lastSeen: new Date(),
      memoryBytes,
    };

    this.devices.set(deviceId, state);
    this.actions.set(deviceId, []);

    return state;
  }

  recordNanoAction(deviceId: string, actionType: string, data: string, compressed: boolean = false): NanoAction {
    const action: NanoAction = {
      actionId: `${deviceId}-${actionType}-${Date.now()}`,
      deviceId,
      timestamp: new Date(),
      actionType,
      compressed,
      compressedData: compressed ? Buffer.from(data).toString('base64') : undefined,
    };

    const existing = this.actions.get(deviceId) || [];
    existing.push(action);
    this.actions.set(deviceId, existing);

    return action;
  }

  updateDeviceState(deviceId: string, battery: number): void {
    const device = this.devices.get(deviceId);
    if (device) {
      device.batteryPercent = battery;
      device.lastSeen = new Date();
    }
  }

  compressActions(deviceId: string): string {
    const actions = this.actions.get(deviceId) || [];
    const data = JSON.stringify(actions);
    return Buffer.from(data).toString('base64');
  }

  isDeviceActive(deviceId: string): boolean {
    const device = this.devices.get(deviceId);
    if (!device) return false;

    const now = Date.now();
    const lastSeenTime = device.lastSeen.getTime();
    return now - lastSeenTime < this.INACTIVE_THRESHOLD_MS;
  }

  isBatteryLow(deviceId: string): boolean {
    const device = this.devices.get(deviceId);
    if (!device) return false;

    return device.batteryPercent < this.BATTERY_LOW_THRESHOLD;
  }

  getStats(): NanoDeviceStats {
    let totalBattery = 0;
    let activeCount = 0;
    let totalActionCount = 0;

    this.devices.forEach((device) => {
      totalBattery += device.batteryPercent;
      if (this.isDeviceActive(device.deviceId)) {
        activeCount++;
      }
    });

    this.actions.forEach((actions) => {
      totalActionCount += actions.length;
    });

    return {
      totalDevices: this.devices.size,
      activeDevices: activeCount,
      totalActions: totalActionCount,
      avgBatteryPercent: this.devices.size > 0 ? totalBattery / this.devices.size : 0,
    };
  }
}
