import * as THREE from "three";

export interface BillDenomination {
  value: number;
  colorA: string;
  colorB: string;
  accent: string;
}

// Colores inspirados en la familia de billetes mexicanos (no reproduce el diseño real).
export const BILL_DENOMINATIONS: BillDenomination[] = [
  { value: 20, colorA: "#0f6e8c", colorB: "#14b8c4", accent: "#0a3d4d" },
  { value: 50, colorA: "#a3195b", colorB: "#e0559b", accent: "#5c0f34" },
  { value: 100, colorA: "#7a1220", colorB: "#c8283f", accent: "#4a0b13" },
  { value: 200, colorA: "#1f5c2e", colorB: "#3fa356", accent: "#12331a" },
  { value: 500, colorA: "#7a4a12", colorB: "#c98a34", accent: "#4a2c0a" },
];

const WIDTH = 660;
const HEIGHT = 300;
const PAPER = "#efe6ce";

function roundedRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function addPaperGrain(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const imageData = ctx.getImageData(0, 0, w, h);
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    const noise = (Math.random() - 0.5) * 14;
    data[i] += noise;
    data[i + 1] += noise;
    data[i + 2] += noise;
  }
  ctx.putImageData(imageData, 0, 0);
}

export function createBillTexture(denomination: BillDenomination): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext("2d")!;
  const r = 8;

  roundedRectPath(ctx, 2, 2, WIDTH - 4, HEIGHT - 4, r);
  ctx.clip();

  // Base de "papel"
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // Tinta de color aplicada sobre el papel (multiply = se ve impresa, no plástica)
  ctx.globalCompositeOperation = "multiply";
  const grad = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
  grad.addColorStop(0, denomination.colorA);
  grad.addColorStop(1, denomination.colorB);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.globalCompositeOperation = "source-over";

  // Marco ornamental: banda guilloché entre dos líneas concéntricas
  const outerInset = 14;
  const innerInset = 34;
  ctx.save();
  roundedRectPath(ctx, outerInset, outerInset, WIDTH - outerInset * 2, HEIGHT - outerInset * 2, r);
  roundedRectPath(ctx, innerInset, innerInset, WIDTH - innerInset * 2, HEIGHT - innerInset * 2, r);
  ctx.clip("evenodd");
  ctx.globalAlpha = 0.4;
  ctx.strokeStyle = denomination.accent;
  ctx.lineWidth = 1.1;
  for (let i = -6; i < 40; i++) {
    ctx.beginPath();
    for (let x = 0; x <= WIDTH; x += 4) {
      const y = HEIGHT / 2 + Math.sin(x * 0.05 + i * 0.5) * (HEIGHT / 2) + i * (HEIGHT / 34);
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.restore();

  roundedRectPath(ctx, outerInset, outerInset, WIDTH - outerInset * 2, HEIGHT - outerInset * 2, r);
  ctx.strokeStyle = denomination.accent;
  ctx.globalAlpha = 0.55;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  roundedRectPath(ctx, innerInset, innerInset, WIDTH - innerInset * 2, HEIGHT - innerInset * 2, r);
  ctx.stroke();
  ctx.globalAlpha = 1;

  // Medallón tipo roseta radiante con el valor
  const cx = WIDTH - 140;
  const cy = HEIGHT / 2;
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, 78, 0, Math.PI * 2);
  ctx.clip();
  ctx.strokeStyle = denomination.accent;
  ctx.globalAlpha = 0.3;
  ctx.lineWidth = 1;
  const rays = 72;
  for (let i = 0; i < rays; i++) {
    const angle = (i / rays) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(angle) * 90, cy + Math.sin(angle) * 90);
    ctx.stroke();
  }
  ctx.restore();
  ctx.globalAlpha = 1;
  ctx.beginPath();
  ctx.arc(cx, cy, 78, 0, Math.PI * 2);
  ctx.strokeStyle = denomination.accent;
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.font = "700 66px Helvetica, Arial, sans-serif";
  ctx.fillStyle = denomination.accent;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(denomination.value), cx, cy + 4);

  // Numerales de esquina
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.font = "700 30px Helvetica, Arial, sans-serif";
  ctx.fillStyle = denomination.accent;
  ctx.fillText(`$${denomination.value}`, 26, 46);

  ctx.font = "600 15px Helvetica, Arial, sans-serif";
  ctx.fillStyle = denomination.accent;
  ctx.globalAlpha = 0.75;
  ctx.fillText("PESOS MXN", 26, HEIGHT - 22);
  ctx.globalAlpha = 1;

  addPaperGrain(ctx, WIDTH, HEIGHT);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}
