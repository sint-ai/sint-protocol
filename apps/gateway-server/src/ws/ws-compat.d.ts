declare module "ws" {
  import type { IncomingMessage } from "node:http";
  import type { Duplex } from "node:stream";

  export class WebSocket {
    static readonly OPEN: number;
    readonly OPEN: number;
    readonly readyState: number;
    send(data: string): void;
    on(event: "close", listener: () => void): this;
  }

  export class WebSocketServer {
    constructor(options?: { noServer?: boolean });
    handleUpgrade(
      request: IncomingMessage,
      socket: Duplex,
      head: Buffer,
      cb: (socket: WebSocket) => void,
    ): void;
    emit(event: "connection", socket: WebSocket, request: IncomingMessage): boolean;
    on(
      event: "connection",
      listener: (socket: WebSocket, request: IncomingMessage) => void,
    ): this;
  }
}
