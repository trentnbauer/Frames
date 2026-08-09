import archiver from 'archiver';
import type { Response } from 'express';

export interface ExportPhoto {
  originalPath: string;
  filename: string;
}

export function streamZip(res: Response, zipName: string, photos: ExportPhoto[]) {
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${zipName}"`);

  const archive = archiver('zip', { zlib: { level: 9 } });
  archive.on('error', (err) => {
    throw err;
  });
  archive.pipe(res);

  for (const photo of photos) {
    archive.file(photo.originalPath, { name: photo.filename });
  }

  return archive.finalize();
}
