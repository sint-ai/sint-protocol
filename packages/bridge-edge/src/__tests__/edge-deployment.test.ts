import { describe, it, expect } from 'vitest';
import { EdgeDeploymentManager } from '../edge-deployment';
import { ApprovalTier } from '@pshkv/core';

describe('EdgeDeploymentManager', () => {
  const manager = new EdgeDeploymentManager();

  it('registers device with minimal capability level', () => {
    const device = manager.registerDevice('device-1', 'arm-cortex', 1, 512, 1000);

    expect(device.deviceId).toBe('device-1');
    expect(device.capabilityLevel).toBe('minimal');
    expect(device.approvalTier).toBe(ApprovalTier.T0_OBSERVE);
    expect(device.registered).toBe(true);
  });

  it('registers device with standard capability level', () => {
    const device = manager.registerDevice('device-2', 'raspberry-pi', 2, 1024, 2000);

    expect(device.capabilityLevel).toBe('standard');
    expect(device.approvalTier).toBe(ApprovalTier.T1_PREPARE);
  });

  it('registers device with advanced capability level', () => {
    const device = manager.registerDevice('device-3', 'jetson', 4, 2048, 4000);

    expect(device.capabilityLevel).toBe('advanced');
    expect(device.approvalTier).toBe(ApprovalTier.T2_ACT);
  });

  it('deploys model to device', () => {
    manager.registerDevice('device-4', 'nvidia-agx', 4, 2048, 10000);
    const deployment = manager.deployModel('device-4', 'yolo-v5', 500);

    expect(deployment.modelName).toBe('yolo-v5');
    expect(deployment.deployed).toBe(true);
    expect(deployment.deployedAt).toBeDefined();
  });

  it('prevents deployment exceeding storage threshold', () => {
    manager.registerDevice('device-5', 'intel-nuc', 2, 1024, 1000);

    expect(() => manager.deployModel('device-5', 'large-model', 800)).toThrow();
  });

  it('updates device health metrics', () => {
    manager.registerDevice('device-6', 'raspberry-pi', 2, 1024, 2000);
    manager.updateDeploymentMetrics('device-6', 50, 60, 45, 0);

    const healthy = manager.isDeviceHealthy('device-6');
    expect(healthy).toBe(true);
  });

  it('detects unhealthy device (high CPU)', () => {
    manager.registerDevice('device-7', 'jetson', 4, 2048, 4000);
    manager.updateDeploymentMetrics('device-7', 95, 70, 50, 0);

    expect(manager.isDeviceHealthy('device-7')).toBe(false);
  });

  it('detects unhealthy device (high memory)', () => {
    manager.registerDevice('device-8', 'jetson', 4, 2048, 4000);
    manager.updateDeploymentMetrics('device-8', 70, 90, 50, 0);

    expect(manager.isDeviceHealthy('device-8')).toBe(false);
  });

  it('detects unhealthy device (high temperature)', () => {
    manager.registerDevice('device-9', 'jetson', 4, 2048, 4000);
    manager.updateDeploymentMetrics('device-9', 70, 70, 90, 0);

    expect(manager.isDeviceHealthy('device-9')).toBe(false);
  });

  it('detects unhealthy device (errors)', () => {
    manager.registerDevice('device-10', 'raspberry-pi', 2, 1024, 2000);
    manager.updateDeploymentMetrics('device-10', 50, 50, 45, 5);

    expect(manager.isDeviceHealthy('device-10')).toBe(false);
  });

  it('records health check', () => {
    const device = manager.registerDevice('device-11', 'nvidia-agx', 4, 2048, 4000);
    const initialCheck = device.lastHealthCheck;

    setTimeout(() => {
      manager.recordHealthCheck('device-11');
    }, 10);

    expect(device.lastHealthCheck).toBeDefined();
  });

  it('retrieves device deployments', () => {
    manager.registerDevice('device-12', 'jetson', 4, 2048, 10000);
    manager.deployModel('device-12', 'model-1', 300);
    manager.deployModel('device-12', 'model-2', 400);

    const deployments = manager.getDeviceDeployments('device-12');
    expect(deployments).toHaveLength(2);
    expect(deployments[0]!.modelName).toBe('model-1');
    expect(deployments[1]!.modelName).toBe('model-2');
  });

  it('returns empty array for unregistered device', () => {
    const deployments = manager.getDeviceDeployments('unknown-device');
    expect(deployments).toEqual([]);
  });
});
