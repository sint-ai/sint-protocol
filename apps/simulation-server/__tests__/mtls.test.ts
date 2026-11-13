import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import https from "node:https";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Hono } from "hono";
import { afterEach, describe, expect, it } from "vitest";
import { loadSimulationWorkerConfig } from "../src/config.js";
import { listenMutualTlsWorker } from "../src/tls.js";

const servers: Array<{ close: () => Promise<void> }> = [];

function configuredTrustDomain(): string | undefined {
  return loadSimulationWorkerConfig({
    NODE_ENV: "test",
    SINT_SIM_TRUST_DOMAIN: "sim.sint.test",
  }).trustDomain;
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
});

function openssl(args: string[], cwd: string): void {
  const result = spawnSync("openssl", args, { cwd, encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || "openssl failed");
  }
}

function materials(options?: { clientSpiffeId: string | null }) {
  const dir = mkdtempSync(join(tmpdir(), "sint-mtls-"));
  writeFileSync(join(dir, "ca.cnf"), `
[req]
distinguished_name = dn
x509_extensions = ext
prompt = no
[dn]
CN = sint-test-ca
[ext]
basicConstraints = critical,CA:TRUE
keyUsage = critical,keyCertSign,cRLSign
`);
  writeFileSync(join(dir, "server.cnf"), `
[req]
distinguished_name = dn
req_extensions = ext
prompt = no
[dn]
CN = localhost
[ext]
subjectAltName = DNS:localhost,IP:127.0.0.1
basicConstraints = CA:FALSE
`);
  openssl(["genrsa", "-out", "ca.key", "2048"], dir);
  openssl(["req", "-new", "-x509", "-key", "ca.key", "-out", "ca.crt", "-days", "1", "-config", "ca.cnf"], dir);
  openssl(["genrsa", "-out", "server.key", "2048"], dir);
  openssl(["req", "-new", "-key", "server.key", "-out", "server.csr", "-config", "server.cnf"], dir);
  openssl([
    "x509", "-req", "-in", "server.csr", "-CA", "ca.crt", "-CAkey", "ca.key",
    "-CAcreateserial", "-out", "server.crt", "-days", "1",
    "-extfile", "server.cnf", "-extensions", "ext",
  ], dir);
  if (options) {
    const san = options.clientSpiffeId === null
      ? ""
      : `subjectAltName = URI:${options.clientSpiffeId}\n`;
    writeFileSync(join(dir, "client.cnf"), `
[req]
distinguished_name = dn
req_extensions = ext
prompt = no
[dn]
CN = sint-client
[ext]
${san}basicConstraints = CA:FALSE
extendedKeyUsage = clientAuth
`);
    openssl(["genrsa", "-out", "client.key", "2048"], dir);
    openssl(["req", "-new", "-key", "client.key", "-out", "client.csr", "-config", "client.cnf"], dir);
    openssl([
      "x509", "-req", "-in", "client.csr", "-CA", "ca.crt", "-CAkey", "ca.key",
      "-CAcreateserial", "-out", "client.crt", "-days", "1",
      "-extfile", "client.cnf", "-extensions", "ext",
    ], dir);
  }
  return {
    cert: readFileSync(join(dir, "server.crt"), "utf8"),
    key: readFileSync(join(dir, "server.key"), "utf8"),
    clientCa: readFileSync(join(dir, "ca.crt"), "utf8"),
    clientCert: options ? readFileSync(join(dir, "client.crt"), "utf8") : undefined,
    clientKey: options ? readFileSync(join(dir, "client.key"), "utf8") : undefined,
  };
}

function getWithoutClientCert(port: number, ca: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const request = https.request({
      host: "127.0.0.1",
      servername: "localhost",
      port,
      path: "/v1/health",
      method: "GET",
      ca,
      rejectUnauthorized: true,
    }, (response) => {
      response.resume();
      resolve(response.statusCode ?? 0);
    });
    request.on("error", reject);
    request.end();
  });
}

function getWithClientCert(
  port: number,
  identity: { clientCa: string; clientCert?: string; clientKey?: string },
): Promise<number> {
  return new Promise((resolve, reject) => {
    const request = https.request({
      host: "127.0.0.1",
      servername: "localhost",
      port,
      path: "/v1/health",
      method: "GET",
      ca: identity.clientCa,
      cert: identity.clientCert,
      key: identity.clientKey,
      rejectUnauthorized: true,
    }, (response) => {
      response.resume();
      resolve(response.statusCode ?? 0);
    });
    request.on("error", reject);
    request.end();
  });
}

describe("simulation worker mutual TLS", () => {
  it("rejects a TLS client that presents no certificate", async () => {
    const identity = materials();
    const app = new Hono();
    app.get("/v1/health", (context) => context.json({ status: "ok" }));
    const server = await listenMutualTlsWorker(app.fetch, identity);
    servers.push(server);

    await expect(getWithoutClientCert(server.port, identity.clientCa)).rejects.toThrow();
  });

  it("rejects a client certificate whose SPIFFE ID is outside the configured trust domain", async () => {
    const identity = materials({ clientSpiffeId: "spiffe://sim.sint.test.evil/worker" });
    const app = new Hono();
    app.get("/v1/health", (context) => context.json({ status: "ok" }));
    const server = await listenMutualTlsWorker(app.fetch, identity, { trustDomain: configuredTrustDomain() });
    servers.push(server);

    await expect(getWithClientCert(server.port, identity)).rejects.toThrow();
  });

  it("rejects a client certificate that omits its SPIFFE ID when a trust domain is configured", async () => {
    const identity = materials({ clientSpiffeId: null });
    const app = new Hono();
    app.get("/v1/health", (context) => context.json({ status: "ok" }));
    const server = await listenMutualTlsWorker(app.fetch, identity, { trustDomain: configuredTrustDomain() });
    servers.push(server);

    await expect(getWithClientCert(server.port, identity)).rejects.toThrow();
  });

  it("accepts a client certificate whose SPIFFE ID is in the configured trust domain", async () => {
    const identity = materials({ clientSpiffeId: "spiffe://sim.sint.test/worker" });
    const app = new Hono();
    app.get("/v1/health", (context) => context.json({ status: "ok" }));
    const server = await listenMutualTlsWorker(app.fetch, identity, { trustDomain: configuredTrustDomain() });
    servers.push(server);

    await expect(getWithClientCert(server.port, identity)).resolves.toBe(200);
  });
});
