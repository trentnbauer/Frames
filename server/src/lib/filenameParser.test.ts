import { describe, expect, it } from 'vitest';
import { parseFilename } from './filenameParser.js';

describe('parseFilename', () => {
  it('detects camera and film stock separated by underscores', () => {
    const result = parseFilename('Leica_M6_Portra_400_roll12_003.jpg');
    expect(result.camera).toBe('Leica M6');
    expect(result.filmStock).toBe('Portra 400');
  });

  it('detects season keyword directly in the filename', () => {
    const result = parseFilename('2024-Winter-Nikon-FM2-HP5-001.jpg');
    expect(result.camera).toBe('Nikon FM2');
    expect(result.filmStock).toBe('HP5');
    expect(result.season).toBe('winter');
  });

  it('normalizes "fall" to "autumn"', () => {
    const result = parseFilename('Fall_shoot_001.jpg');
    expect(result.season).toBe('autumn');
  });

  it('derives season from an embedded date when no keyword present', () => {
    const result = parseFilename('IMG_20240715_scan_04.jpg');
    expect(result.season).toBe('summer');
  });

  it('returns nulls for a generic camera-phone filename', () => {
    const result = parseFilename('PXL_20260801_050128275.jpg');
    expect(result.camera).toBeNull();
    expect(result.filmStock).toBeNull();
  });

  it('is case-insensitive and separator-agnostic', () => {
    const result = parseFilename('mamiya.7.tri-x.400.jpg');
    expect(result.camera).toBe('Mamiya 7');
    expect(result.filmStock).toBe('Tri-X 400');
  });
});
