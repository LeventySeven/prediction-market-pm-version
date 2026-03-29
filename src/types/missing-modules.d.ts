declare module 'jssoup' {
  class JSSoup {
    constructor(markup: string);
    findAll(name: string): Array<{ getText(): string; attrs?: Record<string, string> }>;
    find(name: string): { getText(): string; attrs?: Record<string, string> } | null;
  }
  export default JSSoup;
}

declare module 'ws' {
  import { EventEmitter } from 'events';
  import { IncomingMessage, Server as HttpServer } from 'http';
  import { Duplex } from 'stream';

  class WebSocket extends EventEmitter {
    static readonly CONNECTING: 0;
    static readonly OPEN: 1;
    static readonly CLOSING: 2;
    static readonly CLOSED: 3;

    readyState: number;
    constructor(address: string | URL, options?: Record<string, unknown>);
    close(code?: number, data?: string): void;
    send(data: string | Buffer | ArrayBuffer, cb?: (err?: Error) => void): void;
    on(event: 'message', listener: (data: Buffer | ArrayBuffer | Buffer[]) => void): this;
    on(event: 'close', listener: (code: number, reason: Buffer) => void): this;
    on(event: 'error', listener: (err: Error) => void): this;
    on(event: 'open', listener: () => void): this;
    on(event: string, listener: (...args: unknown[]) => void): this;
  }

  class WebSocketServer extends EventEmitter {
    constructor(options?: { noServer?: boolean; server?: HttpServer; port?: number; path?: string });
    handleUpgrade(request: IncomingMessage, socket: Duplex, head: Buffer, callback: (ws: WebSocket) => void): void;
    on(event: 'connection', listener: (ws: WebSocket, request: IncomingMessage) => void): this;
    on(event: string, listener: (...args: unknown[]) => void): this;
    clients: Set<WebSocket>;
    close(cb?: (err?: Error) => void): void;
  }

  export { WebSocket, WebSocketServer };
}

declare module 'bcryptjs' {
  export function hash(s: string, salt: number | string): Promise<string>;
  export function compare(s: string, hash: string): Promise<boolean>;
  export function genSaltSync(rounds?: number): string;
  export function hashSync(s: string, salt: number | string): string;
  export function compareSync(s: string, hash: string): boolean;
  const bcrypt: {
    hash: typeof hash;
    compare: typeof compare;
    genSaltSync: typeof genSaltSync;
    hashSync: typeof hashSync;
    compareSync: typeof compareSync;
  };
  export default bcrypt;
}
