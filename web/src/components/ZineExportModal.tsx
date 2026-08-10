import { useEffect, useRef, useState } from 'react';
import type { Idea, IdeaPhoto } from '../types.js';
import { getStoredAccent } from '../theme.js';
import { useEscapeKey } from '../useEscapeKey.js';

interface Props {
  open: boolean;
  idea: Idea | null;
  photos: IdeaPhoto[];
  onClose: () => void;
}

// One-sheet, single-sided, 8-page "cut-and-fold" zine — the classic DIY
// format: fold a landscape sheet into eighths, slit the center fold across
// its middle two panels only, then fold into a booklet. Because of that
// slit, a single printed side becomes a fully two-sided-reading 8-page
// booklet. The panel grid below (top row rotated 180°, cover and back cover
// landing in the top row) is the standard layout for this fold — it's a
// public-domain paper-craft technique, not specific to any one tool.
const DPI = 300;
const PAPER_W_IN = 11; // US Letter, landscape
const PAPER_H_IN = 8.5;
const CANVAS_W = PAPER_W_IN * DPI;
const CANVAS_H = PAPER_H_IN * DPI;
const COLS = 4;
const ROWS = 2;
const PANEL_W = CANVAS_W / COLS;
const PANEL_H = CANVAS_H / ROWS;

type Panel =
  | { row: 0 | 1; col: 0 | 1 | 2 | 3; kind: 'photo'; photoIndex: number; rotate: boolean }
  | { row: 0 | 1; col: 0 | 1 | 2 | 3; kind: 'cover' | 'back'; rotate: boolean };

const PANELS: Panel[] = [
  { row: 0, col: 0, kind: 'photo', photoIndex: 4, rotate: true }, // page 6
  { row: 0, col: 1, kind: 'photo', photoIndex: 5, rotate: true }, // page 7
  { row: 0, col: 2, kind: 'back', rotate: true }, // page 8 / back cover
  { row: 0, col: 3, kind: 'cover', rotate: true }, // page 1 / cover
  { row: 1, col: 0, kind: 'photo', photoIndex: 3, rotate: false }, // page 5
  { row: 1, col: 1, kind: 'photo', photoIndex: 2, rotate: false }, // page 4
  { row: 1, col: 2, kind: 'photo', photoIndex: 1, rotate: false }, // page 3
  { row: 1, col: 3, kind: 'photo', photoIndex: 0, rotate: false }, // page 2
];

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

// wrapText only breaks *between* words — a single long word (e.g. a city
// name) at a fixed large font size can still be wider than the panel and
// get clipped. Shrink the font until every wrapped line actually fits both
// the panel's width and the vertical space available for the title block.
function fitTitle(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxHeight: number,
  startSize: number,
  minSize: number
): { size: number; lines: string[]; lineHeight: number } {
  for (let size = startSize; size >= minSize; size -= 6) {
    ctx.font = `bold ${size}px system-ui, sans-serif`;
    const lines = wrapText(ctx, text, maxWidth);
    const lineHeight = size * 1.12;
    const widest = Math.max(...lines.map((l) => ctx.measureText(l).width));
    if (widest <= maxWidth && lines.length * lineHeight <= maxHeight) {
      return { size, lines, lineHeight };
    }
  }
  ctx.font = `bold ${minSize}px system-ui, sans-serif`;
  return { size: minSize, lines: wrapText(ctx, text, maxWidth), lineHeight: minSize * 1.12 };
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function drawCover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, dx: number, dy: number, dw: number, dh: number) {
  const scale = Math.max(dw / img.width, dh / img.height);
  const sw = dw / scale;
  const sh = dh / scale;
  const sx = (img.width - sw) / 2;
  const sy = (img.height - sh) / 2;
  ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
}

async function renderZine(canvas: HTMLCanvasElement, idea: Idea, photos: IdeaPhoto[], accent: string) {
  canvas.width = CANVAS_W;
  canvas.height = CANVAS_H;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#0d0e14';
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  const interior = photos.slice(0, 6);
  const images = await Promise.all(interior.map((p) => loadImage(`/files/display/${p.id}`)));

  for (const panel of PANELS) {
    const x = panel.col * PANEL_W;
    const y = panel.row * PANEL_H;

    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, PANEL_W, PANEL_H);
    ctx.clip();

    if (panel.rotate) {
      ctx.translate(x + PANEL_W / 2, y + PANEL_H / 2);
      ctx.rotate(Math.PI);
      ctx.translate(-PANEL_W / 2, -PANEL_H / 2);
    } else {
      ctx.translate(x, y);
    }

    if (panel.kind === 'photo') {
      const img = images[panel.photoIndex];
      if (img) {
        drawCover(ctx, img, 0, 0, PANEL_W, PANEL_H);
      } else {
        ctx.fillStyle = '#1c1e2b';
        ctx.fillRect(0, 0, PANEL_W, PANEL_H);
      }
    } else if (panel.kind === 'cover') {
      ctx.fillStyle = '#0d0e14';
      ctx.fillRect(0, 0, PANEL_W, PANEL_H);
      ctx.fillStyle = accent;
      ctx.textAlign = 'center';
      const titleMaxWidth = PANEL_W - 140;
      const titleMaxHeight = idea.notes ? PANEL_H * 0.62 : PANEL_H * 0.8;
      const { lines, lineHeight } = fitTitle(ctx, idea.title.toUpperCase(), titleMaxWidth, titleMaxHeight, 130, 48);
      const totalHeight = lines.length * lineHeight;
      let ty = PANEL_H / 2 - totalHeight / 2 + lineHeight * 0.75;
      for (const line of lines) {
        ctx.fillText(line, PANEL_W / 2, ty);
        ty += lineHeight;
      }
      if (idea.notes) {
        ctx.font = '48px system-ui, sans-serif';
        ctx.fillStyle = 'rgba(255,255,255,0.65)';
        const subLines = wrapText(ctx, idea.notes, PANEL_W - 160).slice(0, 3);
        let sy = ty + 30;
        for (const line of subLines) {
          ctx.fillText(line, PANEL_W / 2, sy);
          sy += 60;
        }
      }
    } else {
      ctx.fillStyle = '#0d0e14';
      ctx.fillRect(0, 0, PANEL_W, PANEL_H);
      ctx.textAlign = 'center';
      ctx.fillStyle = accent;
      ctx.font = 'bold 60px system-ui, sans-serif';
      ctx.fillText('◆ FRAMES ◆', PANEL_W / 2, PANEL_H / 2 - 20);
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.font = '36px system-ui, sans-serif';
      ctx.fillText(`${photos.length} frame${photos.length === 1 ? '' : 's'}`, PANEL_W / 2, PANEL_H / 2 + 40);
    }

    ctx.restore();
  }

  // Fold guides: dashed lines at every panel boundary, plus a solid "cut
  // here" mark across the inner two panels of the center horizontal fold —
  // the single slit that makes the whole fold work.
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 2;
  ctx.setLineDash([14, 10]);
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * PANEL_W, 0);
    ctx.lineTo(c * PANEL_W, CANVAS_H);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(0, PANEL_H);
  ctx.lineTo(PANEL_W, PANEL_H);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(3 * PANEL_W, PANEL_H);
  ctx.lineTo(4 * PANEL_W, PANEL_H);
  ctx.stroke();

  ctx.setLineDash([]);
  ctx.strokeStyle = '#e0524f';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(PANEL_W, PANEL_H);
  ctx.lineTo(3 * PANEL_W, PANEL_H);
  ctx.stroke();
}

export function ZineExportModal({ open, idea, photos, onClose }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [rendering, setRendering] = useState(false);

  useEscapeKey(open, onClose);

  useEffect(() => {
    if (!open || !idea || !canvasRef.current) return;
    setRendering(true);
    renderZine(canvasRef.current, idea, photos, getStoredAccent()).finally(() => setRendering(false));
  }, [open, idea, photos]);

  if (!open || !idea) return null;

  function download() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${idea!.title.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-zine.jpg`;
        a.click();
        URL.revokeObjectURL(url);
      },
      'image/jpeg',
      0.92
    );
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card modal-card--wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal-card__title">Zine — one-sheet, 8-page fold</div>
        <p className="muted" style={{ margin: '-4px 0 0' }}>
          Uses up to 6 frames from this project (in their sequence order) plus the title as the cover. Print single-sided
          on US Letter, landscape.
        </p>

        <div className="zine-preview">
          <canvas ref={canvasRef} className="zine-preview__canvas" />
          {rendering && <div className="zine-preview__loading">Rendering…</div>}
        </div>

        <details className="zine-fold-help">
          <summary>How to fold it</summary>
          <ol>
            <li>Fold the printed sheet in half left-to-right, crease, then unfold.</li>
            <li>Fold in half top-to-bottom, crease, then unfold.</li>
            <li>Fold in half left-to-right again, crease, then unfold completely flat.</li>
            <li>
              Cut along the center horizontal crease — but only across the middle two panels (the red line above), not
              the full width.
            </li>
            <li>Fold in half top-to-bottom, then push the two ends toward the middle so the cut opens into a plus shape.</li>
            <li>Fold the resulting panels around into a booklet, cover facing out.</li>
          </ol>
        </details>

        <div className="modal-actions">
          <button className="btn" onClick={onClose}>Close</button>
          <button className="btn btn-solid" onClick={download} disabled={rendering}>
            Download JPG
          </button>
        </div>
      </div>
    </div>
  );
}
