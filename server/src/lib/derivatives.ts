import sharp from 'sharp';
import path from 'node:path';
import { THUMBS_DIR, DISPLAY_DIR } from '../db.js';
import { extractPalette } from './palette.js';

const THUMB_WIDTH = 400;
const DISPLAY_WIDTH = 1600;

export interface Derivatives {
  thumbPath: string;
  displayPath: string;
  width: number;
  height: number;
  palette: string[];
}

export async function generateDerivatives(originalPath: string, baseName: string): Promise<Derivatives> {
  const image = sharp(originalPath).rotate();
  const meta = await image.metadata();

  const thumbFile = `${baseName}.jpg`;
  const thumbPath = path.join(THUMBS_DIR, thumbFile);
  await sharp(originalPath).rotate().resize({ width: THUMB_WIDTH }).jpeg({ quality: 78 }).toFile(thumbPath);

  const displayFile = `${baseName}.jpg`;
  const displayPath = path.join(DISPLAY_DIR, displayFile);
  await sharp(originalPath).rotate().resize({ width: DISPLAY_WIDTH, withoutEnlargement: true }).jpeg({ quality: 85 }).toFile(displayPath);

  const palette = await extractPalette(originalPath);

  return {
    thumbPath,
    displayPath,
    width: meta.width ?? 0,
    height: meta.height ?? 0,
    palette,
  };
}
