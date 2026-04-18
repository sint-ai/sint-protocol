import { ApprovalTier } from '@pshkv/core';

export type DeviceType = 'jetson' | 'raspberry-pi' | 'nvidia-agx' | 'intel-nuc' | 'arm-cortex';
export type CapabilityLevel = 'minimal' | 'standard' | 'advanced';

export interface EdgeDevice {
  deviceId: string;
  type: DeviceType;
  name: string;
  cpuCores: number;
  memoryMb: number;
  storageMb: number;
  capabilityLevel: CapabilityLevel;
  approvalTier: ApprovalTier;
  registered: boolean;
  registeredAt: Date;
  lastHealthCheck: Date;
}

export interface EdgeDeployment {
  deploymentId: string;
  deviceId: string;
  modelName: string;
  modelSize: number;
  deployed: boolean;
  deployedAt?: Date;
}

export interface HealthMetrics {
  cpuUsagePercent: number;
  memoryUsagePercent: number;
  temperatureCelsius: number;
  errors: number;
  lastUpdate: Date;
}

export class EdgeDeploymentManager {
  private devices = new Map<string, EdgeDevice>();
  private deployments = new Map<string, EdgeDeployment[]>();
  private metrics = new Map<string, HealthMetrics>();

  registerDevice(deviceId: string, type: DeviceType, cpuCores: number, memoryMb: number, storageMb: number): EdgeDevice {
    const capabilityLevel = this.determineCapabilityLevel(cpuCores, memoryMb);
    const approvalTier = this.assignTier(capabilityLevel);

    const device: EdgeDevice = {
      deviceId,
      type,
      name: `${type}-${deviceId}`,
      cpuCores,
      memoryMb,
      storageMb,
      capabilityLevel,
      approvalTier,
      registered: true,
      registeredAt: new Date(),
      lastHealthCheck: new Date(),
    };

    this.devices.set(deviceId, device);
    this.deployments.set(deviceId, []);

    return device;
  }

  private determineCapabilityLevel(cpuCores: number, memoryMb: number): CapabilityLevel {
    if (cpuCores >= 4 && memoryMb >= 2048) {
      return 'advanced';
    }
    if (cpuCores >= 2 && memoryMb >= 1024) {
      return 'standard';
    }
    return 'minimal';
  }

  private assignTier(capabilityLevel: CapabilityLevel): ApprovalTier {
    switch (capabilityLevel) {
      case 'advanced':
        return ApprovalTier.T2_ACT;
      case 'standard':
        return ApprovalTier.T1_PREPARE;
      default:
        return ApprovalTier.T0_OBSERVE;
    }
  }

  deployModel(deviceId: string, modelName: string, modelSize: number): EdgeDeployment {
    const device = this.devices.get(deviceId);
    if (!device) throw new Error(`Device ${deviceId} not found`);

    const storageThreshold = device.storageMb * 0.7;
    if (modelSize > storageThreshold) {
      throw new Error(`Model size ${modelSize}MB exceeds 70% storage threshold of ${storageThreshold}MB`);
    }

    const deployment: EdgeDeployment = {
      deploymentId: `${deviceId}-${modelName}-${Date.now()}`,
      deviceId,
      modelName,
      modelSize,
      deployed: true,
      deployedAt: new Date(),
    };

    const existing = this.deployments.get(deviceId) || [];
    existing.push(deployment);
    this.deployments.set(deviceId, existing);

    return deployment;
  }

  updateDeploymentMetrics(deviceId: string, cpu: number, memory: number, temp: number, errors: number): void {
    this.metrics.set(deviceId, {
      cpuUsagePercent: cpu,
      memoryUsagePercent: memory,
      temperatureCelsius: temp,
      errors,
      lastUpdate: new Date(),
    });
  }

  recordHealthCheck(deviceId: string): void {
    const device = this.devices.get(deviceId);
    if (device) {
      device.lastHealthCheck = new Date();
    }
  }

  isDeviceHealthy(deviceId: string): boolean {
    const metrics = this.metrics.get(deviceId);
    if (!metrics) return false;

    return (
      metrics.cpuUsagePercent < 90 &&
      metrics.memoryUsagePercent < 85 &&
      metrics.temperatureCelsius < 85 &&
      metrics.errors === 0
    );
  }

  getDeviceDeployments(deviceId: string): EdgeDeployment[] {
    return this.deployments.get(deviceId) || [];
  }
}
