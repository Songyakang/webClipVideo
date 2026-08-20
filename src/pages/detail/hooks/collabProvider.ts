/**
 * 协作同步客户端（P0）：与 Rust 内嵌中继（src-tauri/src/collab）配套的轻量 provider。
 * 协议与 y-websocket 对齐但不依赖其包：
 *   update: [varUint 0(sync), varUint 0(update), varUint len, bytes]
 *   sync2:  [varUint 0, varUint 2, varUint len, stateVector]
 *   sync1:  [varUint 0, varUint 1, varUint len, updateBytes]（服务端回发缺失部分）
 */
import * as Y from "yjs";

// ---- varint 编解码（yjs 风格，7bit 小端 + 高位续位）----

// 注意：用乘除/取模而非位运算——JS 位运算按 32 位截断，大整数会溢出
export function writeVarUint(buf: number[], v: number) {
  for (;;) {
    const b = v % 128;
    v = Math.floor(v / 128);
    if (v === 0) {
      buf.push(b);
      break;
    }
    buf.push(b | 0x80);
  }
}

export function readVarUint(data: Uint8Array, offset: number): [number, number] {
  let value = 0;
  let i = offset;
  let mult = 1;
  for (;;) {
    const b = data[i];
    value += (b % 128) * mult;
    i++;
    if (b < 128) return [value, i];
    mult *= 128;
  }
}

function encodeSync(subtype: number, payload: Uint8Array): Uint8Array {
  const buf: number[] = [];
  writeVarUint(buf, 0); // messageSync
  writeVarUint(buf, subtype);
  writeVarUint(buf, payload.length);
  for (let i = 0; i < payload.length; i++) buf.push(payload[i]);
  return new Uint8Array(buf);
}

const SUB_UPDATE = 0;
const SUB_SYNC1 = 1;
const SUB_SYNC2 = 2;

/**
 * 最小协作 provider：连上 Rust 中继后发送 sync2（state vector），
 * 收到 sync1 应用缺失更新并回发 sync2（空更新则停止，避免空转）。
 * 本地 Y.Doc 变更自动上行。
 */
export class CollabProvider {
  private doc: Y.Doc;
  private ws: WebSocket;
  private onSynced: (() => void) | null;
  private synced = false;

  constructor(url: string, doc: Y.Doc, onSynced?: () => void) {
    this.doc = doc;
    this.onSynced = onSynced ?? null;
    this.ws = new WebSocket(url);
    this.ws.binaryType = "arraybuffer";

    this.ws.onopen = () => this.sendSync2();
    this.ws.onmessage = (e: MessageEvent) => {
      if (typeof e.data === "string") return; // P0 暂不处理 awareness
      this.handle(new Uint8Array(e.data));
    };

    // 本地编辑（origin 非本 provider）上行
    doc.on("update", (update: Uint8Array, origin: unknown) => {
      if (origin === this) return;
      if (this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(encodeSync(SUB_UPDATE, update));
      }
    });
  }

  private sendSync2() {
    const sv = Y.encodeStateVector(this.doc);
    this.ws.send(encodeSync(SUB_SYNC2, sv));
  }

  private handle(data: Uint8Array) {
    const [msgType, n1] = readVarUint(data, 0);
    if (msgType !== 0) return;
    const [subtype, n2] = readVarUint(data, n1);
    const [len, n3] = readVarUint(data, n2);
    const payload = data.slice(n3, n3 + len);
    if (subtype === SUB_SYNC1) {
      const hadContent = payload.length > 0;
      Y.applyUpdate(this.doc, payload, this);
      if (!this.synced) {
        this.synced = true;
        this.onSynced?.();
      }
      // 回发新的 state vector 换取剩余缺失（空更新则收敛，不再回发）
      if (hadContent) this.sendSync2();
    } else if (subtype === SUB_UPDATE) {
      Y.applyUpdate(this.doc, payload, this);
    }
  }

  destroy() {
    this.ws.close();
  }
}
