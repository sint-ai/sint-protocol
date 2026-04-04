import { describe, it, expect } from "vitest";
import { OnnxExecutor } from "../src/onnx-executor.js";

describe("OnnxExecutor", () => {
  it("createMock returns functional executor", () => {
    const mock = OnnxExecutor.createMock();
    expect(mock).toBeDefined();
    expect(typeof mock.loadModel).toBe("function");
    expect(typeof mock.runInference).toBe("function");
    expect(typeof mock.dispose).toBe("function");
  });

  it("mock loadModel succeeds with ok result", async () => {
    const mock = OnnxExecutor.createMock();
    const result = await mock.loadModel("model.onnx");
    expect(result.ok).toBe(true);
  });

  it("mock runInference returns Float32Array with ok result", async () => {
    const mock = OnnxExecutor.createMock();
    await mock.loadModel("model.onnx");
    const input = new Float32Array([1.0, 2.0, 3.0]);
    const result = await mock.runInference(input);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBeInstanceOf(Float32Array);
      expect(result.value.length).toBe(3);
      // Mock fills with 0.5
      expect(result.value[0]).toBe(0.5);
      expect(result.value[1]).toBe(0.5);
      expect(result.value[2]).toBe(0.5);
    }
  });

  it("mock dispose completes without error", async () => {
    const mock = OnnxExecutor.createMock();
    await mock.loadModel("model.onnx");
    expect(() => mock.dispose()).not.toThrow();
  });

  it("constructor accepts deployment profile", () => {
    const executor = new OnnxExecutor("edge");
    expect(executor.getDeploymentProfile()).toBe("edge");
  });

  it("loadModel fails gracefully without onnxruntime-node", async () => {
    const executor = new OnnxExecutor("edge");
    const result = await executor.loadModel("/nonexistent/model.onnx");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain("onnxruntime");
    }
  });

  it("runInference before loadModel returns error", async () => {
    const executor = new OnnxExecutor("edge");
    const result = await executor.runInference(new Float32Array([1.0]));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain("Model not loaded");
    }
  });

  it("provider selection matches deployment profile", () => {
    const full = new OnnxExecutor("full");
    expect(full.getProvider()).toBe("cuda");

    const edge = new OnnxExecutor("edge");
    expect(edge.getProvider()).toBe("cpu");

    const split = new OnnxExecutor("split");
    expect(split.getProvider()).toBe("cpu");

    const lite = new OnnxExecutor("lite");
    expect(lite.getProvider()).toBe("cpu");
  });
});
