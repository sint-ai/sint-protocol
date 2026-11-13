import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import https from "node:https";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Hono } from "hono";
import { afterEach, describe, expect, it } from "vitest";
import { listenMutualTlsWorker } from "../src/tls.js";

const servers: Array<{ close: () => Promise<void> }> = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
});

function openssl(args: string[], cwd: string): void {
  const result = spawnSync("openssl", args, { cwd, encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || "openssl failed");
  }
}

function materials() {
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
  return {
    cert: readFileSync(join(dir, "server.crt"), "utf8"),
    key: readFileSync(join(dir, "server.key"), "utf8"),
    clientCa: readFileSync(join(dir, "ca.crt"), "utf8"),
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

describe("simulation worker mutual TLS", () => {
  it("rejects a TLS client that presents no certificate", async () => {
    const identity = materials();
    const app = new Hono();
    app.get("/v1/health", (context) => context.json({ status: "ok" }));
    const server = await listenMutualTlsWorker(app.fetch, identity);
    servers.push(server);

    await expect(getWithoutClientCert(server.port, identity.clientCa)).rejects.toThrow();
  });
});
