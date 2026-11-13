import type { IncomingMessage, ServerResponse } from "node:http";
import { createServer, type Server } from "node:https";
import type { TLSSocket } from "node:tls";

export interface MutualTlsIdentity {
  cert: string;
  key: string;
  clientCa: string;
}

export interface MutualTlsListener {
  port: number;
  close: () => Promise<void>;
}

type FetchHandler = (request: Request) => Response | Promise<Response>;

export function listenMutualTlsWorker(
  fetch: FetchHandler,
  identity: MutualTlsIdentity,
): Promise<MutualTlsListener> {
  const server = createServer(
    {
      cert: identity.cert,
      key: identity.key,
      ca: identity.clientCa,
      requestCert: true,
      rejectUnauthorized: true,
    },
    (request, response) => {
      const socket = request.socket as TLSSocket;
      if (!socket.authorized) {
        socket.destroy();
        return;
      }
      void forwardFetch(fetch, request, response);
    },
  );
  server.on("tlsClientError", (_error, socket) => {
    socket.destroy();
  });

  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error?: Error): void => {
      if (settled) return;
      settled = true;
      server.off("error", onError);
      if (error) reject(error);
      else resolve(listener(server));
    };
    const onError = (error: Error): void => finish(error);
    server.once("error", onError);
    server.listen(0, "127.0.0.1", () => finish());
  });
}

function listener(server: Server): MutualTlsListener {
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("mutual TLS worker did not bind a TCP port");
  }
  return {
    port: address.port,
    close: () =>
      new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}

async function forwardFetch(
  fetch: FetchHandler,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  const host = request.headers.host ?? "127.0.0.1";
  const url = new URL(request.url ?? "/", `https://${host}`);
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  const method = request.method ?? "GET";
  const headers = new Headers();
  for (const [key, value] of Object.entries(request.headers)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const item of value) headers.append(key, item);
      continue;
    }
    headers.set(key, value);
  }
  const hasBody = method !== "GET" && method !== "HEAD";
  const upstream = await fetch(
    new Request(url, {
      method,
      headers,
      body: hasBody ? Buffer.concat(chunks) : undefined,
    }),
  );
  response.statusCode = upstream.status;
  upstream.headers.forEach((value, key) => {
    response.setHeader(key, value);
  });
  response.end(Buffer.from(await upstream.arrayBuffer()));
}
