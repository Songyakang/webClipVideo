import type { CanvasNodeData, EdgeData } from "./types";

const COLORS = {
  bg: "#0d1117",
  gridDot: "#21262d",
  cardBg: "#161b22",
  cardBorder: "#30363d",
  text: "#e6edf3",
  textMuted: "#8b949e",
  textPlaceholder: "#484f58",
  portBg: "#161b22",
  portBorder: "#484f58",
  portHover: "#1f6feb",
  portText: "#8b949e",
  edge: "rgba(88, 166, 255, 0.7)",
  edgeTemp: "#484f58",
  edgeFlow: "rgba(88, 166, 255, 0.4)",
  tagBg: "#1a2a3d",
  tagText: "#58a6ff",
};

const NODE_W = 700;
const NODE_H = 400;
const PORT_SIZE = 40;

export interface HitResult {
  type: "node" | "port-in" | "port-out" | "edge" | "none";
  nodeId?: string;
  edgeId?: string;
}

export function worldToScreen(
  wx: number,
  wy: number,
  offsetX: number,
  offsetY: number,
  scale: number
) {
  const cssScale = scale / 2;
  return { x: wx * cssScale + offsetX, y: wy * cssScale + offsetY };
}

export function screenToWorld(
  sx: number,
  sy: number,
  offsetX: number,
  offsetY: number,
  scale: number
) {
  const cssScale = scale / 2;
  return { x: (sx - offsetX) / cssScale, y: (sy - offsetY) / cssScale };
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

function edgeBezier(from: CanvasNodeData, to: CanvasNodeData) {
  const x1 = from.x + 748;
  const y1 = from.y + 200;
  const x2 = to.x - 48;
  const y2 = to.y + 200;
  const dx = Math.abs(x2 - x1) * 0.5;
  return { x1, y1, x2, y2, cpx1: x1 + dx, cpy1: y1, cpx2: x2 - dx, cpy2: y2 };
}

export function render(
  ctx: CanvasRenderingContext2D,
  width: number, height: number, dpr: number,
  offsetX: number, offsetY: number, scale: number,
  nodes: CanvasNodeData[], edges: EdgeData[],
  connectingFrom: string | null,
  cursorWorldX: number, cursorWorldY: number,
  hoveredPort: string | null,
  hoveredEdgeId: string | null,
  dashOffset: number,
) {
  ctx.save();
  ctx.scale(dpr, dpr);

  const cssScale = scale / 2;

  // Background
  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, width, height);

  // Grid dots
  const dotSpacing = 24;
  const startX = -offsetX % dotSpacing;
  const startY = -offsetY % dotSpacing;
  ctx.fillStyle = COLORS.gridDot;
  for (let x = startX; x < width; x += dotSpacing) {
    for (let y = startY; y < height; y += dotSpacing) {
      ctx.fillRect(x, y, 1, 1);
    }
  }

  ctx.save();
  ctx.translate(offsetX, offsetY);
  ctx.scale(cssScale, cssScale);

  // Edges
  edges.forEach((edge) => {
    const from = nodes.find((n) => n.id === edge.fromNode);
    const to = nodes.find((n) => n.id === edge.toNode);
    if (!from || !to) return;
    const isHovered = edge.id === hoveredEdgeId;

    ctx.strokeStyle = isHovered ? "#f85149" : COLORS.edge;
    ctx.lineWidth = isHovered ? 3 : 2;
    drawEdge(ctx, from, to);

    // Flow animation
    ctx.save();
    ctx.strokeStyle = COLORS.edgeFlow;
    ctx.lineWidth = 3;
    ctx.setLineDash([12, 24]);
    ctx.lineDashOffset = -dashOffset;
    drawEdge(ctx, from, to);
    ctx.setLineDash([]);
    ctx.restore();
  });

  // Temp connecting edge
  if (connectingFrom) {
    const from = nodes.find((n) => n.id === connectingFrom);
    if (from) {
      const x1 = from.x + NODE_W + 28;
      const y1 = from.y + NODE_H / 2;
      const x2 = cursorWorldX;
      const y2 = cursorWorldY;
      ctx.strokeStyle = COLORS.edgeTemp;
      ctx.lineWidth = 2;
      ctx.setLineDash([8, 6]);
      ctx.beginPath();
      const dx = Math.abs(x2 - x1) * 0.5;
      ctx.moveTo(x1, y1);
      ctx.bezierCurveTo(x1 + dx, y1, x2 - dx, y2, x2, y2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  // Flow items
  nodes.forEach((node) => {
    const isHovered =
      hoveredPort === `${node.id}-in` || hoveredPort === `${node.id}-out`;

    ctx.shadowColor = "rgba(0,0,0,0.4)";
    ctx.shadowBlur = 12;
    ctx.shadowOffsetY = 4;

    ctx.fillStyle = COLORS.cardBg;
    ctx.strokeStyle = isHovered ? "#484f58" : COLORS.cardBorder;
    ctx.lineWidth = 1;
    roundRect(ctx, node.x, node.y, NODE_W, NODE_H, 16);
    ctx.fill();
    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
    ctx.stroke();

    ctx.save();
    ctx.beginPath();
    roundRect(ctx, node.x, node.y, NODE_W, NODE_H, 16);
    ctx.clip();

    if (node.type === "image") {
      drawImageNode(ctx, node);
    } else {
      drawTextNode(ctx, node);
    }
    ctx.restore();

    drawPort(ctx, node.x - 48, node.y + NODE_H / 2 - 20, PORT_SIZE, hoveredPort === `${node.id}-in`);
    drawPort(ctx, node.x + NODE_W + 8, node.y + NODE_H / 2 - 20, PORT_SIZE, hoveredPort === `${node.id}-out`);
  });

  ctx.restore();
  ctx.restore();
}

function drawEdge(ctx: CanvasRenderingContext2D, from: CanvasNodeData, to: CanvasNodeData) {
  const b = edgeBezier(from, to);
  ctx.beginPath();
  ctx.moveTo(b.x1, b.y1);
  ctx.bezierCurveTo(b.cpx1, b.cpy1, b.cpx2, b.cpy2, b.x2, b.y2);
  ctx.stroke();
}

function drawPort(
  ctx: CanvasRenderingContext2D, x: number, y: number, size: number, hovered: boolean,
) {
  ctx.fillStyle = hovered ? COLORS.portHover : COLORS.portBg;
  ctx.strokeStyle = hovered ? COLORS.portHover : COLORS.portBorder;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.strokeStyle = hovered ? "#fff" : COLORS.portText;
  ctx.lineWidth = 2;
  const cx = x + size / 2;
  const cy = y + size / 2;
  const d = 6;
  ctx.beginPath();
  ctx.moveTo(cx - d, cy);
  ctx.lineTo(cx + d, cy);
  ctx.moveTo(cx, cy - d);
  ctx.lineTo(cx, cy + d);
  ctx.stroke();
}

function sampleBezier(x1: number, y1: number, cpx1: number, cpy1: number, cpx2: number, cpy2: number, x2: number, y2: number, t: number) {
  const u = 1 - t;
  return {
    x: u * u * u * x1 + 3 * u * u * t * cpx1 + 3 * u * t * t * cpx2 + t * t * t * x2,
    y: u * u * u * y1 + 3 * u * u * t * cpy1 + 3 * u * t * t * cpy2 + t * t * t * y2,
  };
}

function edgeDistanceToPoint(from: CanvasNodeData, to: CanvasNodeData, px: number, py: number) {
  const b = edgeBezier(from, to);
  let minDist = Infinity;
  for (let t = 0; t <= 1; t += 0.05) {
    const pt = sampleBezier(b.x1, b.y1, b.cpx1, b.cpy1, b.cpx2, b.cpy2, b.x2, b.y2, t);
    const d = Math.hypot(pt.x - px, pt.y - py);
    if (d < minDist) minDist = d;
  }
  return minDist;
}

export function hitTest(
  sx: number, sy: number,
  offsetX: number, offsetY: number, scale: number,
  nodes: CanvasNodeData[], edges: EdgeData[],
  containerRect: DOMRect,
): HitResult {
  const cssScale = scale / 2;
  const wx = (sx - containerRect.left - offsetX) / cssScale;
  const wy = (sy - containerRect.top - offsetY) / cssScale;

  // Ports first
  for (const node of nodes) {
    const pox = node.x + NODE_W + 8;
    const poy = node.y + NODE_H / 2 - 20;
    if (wx >= pox && wx <= pox + PORT_SIZE && wy >= poy && wy <= poy + PORT_SIZE) {
      return { type: "port-out", nodeId: node.id };
    }
    const pix = node.x - 48;
    const piy = node.y + NODE_H / 2 - 20;
    if (wx >= pix && wx <= pix + PORT_SIZE && wy >= piy && wy <= piy + PORT_SIZE) {
      return { type: "port-in", nodeId: node.id };
    }
  }

  // Edges (before nodes, larger threshold)
  const threshold = 40;
  for (const edge of edges) {
    const from = nodes.find((n) => n.id === edge.fromNode);
    const to = nodes.find((n) => n.id === edge.toNode);
    if (!from || !to) continue;
    const d = edgeDistanceToPoint(from, to, wx, wy);
    if (d < threshold) {
      return { type: "edge", edgeId: edge.id };
    }
  }

  // Nodes
  for (const node of nodes) {
    if (wx >= node.x && wx <= node.x + NODE_W && wy >= node.y && wy <= node.y + NODE_H) {
      return { type: "node", nodeId: node.id };
    }
  }

  return { type: "none" };
}

export function getPortWorldPos(node: CanvasNodeData, portType: "in" | "out") {
  if (portType === "out") return { x: node.x + 748, y: node.y + 200 };
  return { x: node.x - 48, y: node.y + 200 };
}

function drawTextNode(ctx: CanvasRenderingContext2D, node: CanvasNodeData) {
  if (node.content) {
    ctx.fillStyle = COLORS.text;
    ctx.font = "14px Inter, Avenir, Helvetica, Arial, sans-serif";
    ctx.textBaseline = "top";
    wrapText(ctx, node.content, node.x + 32, node.y + 36, NODE_W - 64, 22);
  } else {
    ctx.fillStyle = COLORS.textPlaceholder;
    ctx.font = "italic 14px Inter, Avenir, Helvetica, Arial, sans-serif";
    ctx.textBaseline = "top";
    ctx.fillText("双击编辑文本", node.x + 32, node.y + 36);
  }
}

function drawImageNode(ctx: CanvasRenderingContext2D, node: CanvasNodeData) {
  const imgX = node.x + 32;
  const imgY = node.y + 36;
  const imgW = NODE_W - 64;
  const imgH = NODE_H - 96;

  ctx.fillStyle = "#0d1117";
  roundRect(ctx, imgX, imgY, imgW, imgH, 8);
  ctx.fill();

  ctx.strokeStyle = "#21262d";
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 4]);
  roundRect(ctx, imgX, imgY, imgW, imgH, 8);
  ctx.stroke();
  ctx.setLineDash([]);

  const cx = imgX + imgW / 2;
  const cy = imgY + imgH / 2 - 12;
  ctx.strokeStyle = "#30363d";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx - 30, cy + 10);
  ctx.lineTo(cx - 12, cy - 10);
  ctx.lineTo(cx, cy);
  ctx.lineTo(cx + 12, cy - 6);
  ctx.lineTo(cx + 30, cy + 10);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx + 14, cy - 12, 8, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = "#484f58";
  ctx.font = "13px Inter, Avenir, Helvetica, Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillText("图片", cx, cy + 16);

  if (node.content) {
    ctx.fillStyle = COLORS.text;
    ctx.font = "12px Inter, Avenir, Helvetica, Arial, sans-serif";
    ctx.textBaseline = "top";
    ctx.fillText(node.content, node.x + 32, imgY + imgH + 12);
  }

  ctx.textAlign = "start";
}

function wrapText(
  ctx: CanvasRenderingContext2D, text: string,
  x: number, y: number, maxWidth: number, lineHeight: number,
) {
  const lines = text.split("\n");
  let cy = y;
  for (const line of lines) {
    const words = line.split("");
    let currentLine = "";
    for (const char of words) {
      const testLine = currentLine + char;
      if (ctx.measureText(testLine).width > maxWidth && currentLine.length > 0) {
        ctx.fillText(currentLine, x, cy);
        cy += lineHeight;
        currentLine = char;
      } else {
        currentLine = testLine;
      }
    }
    ctx.fillText(currentLine, x, cy);
    cy += lineHeight;
    if (cy - y > NODE_H - 72) break;
  }
}
