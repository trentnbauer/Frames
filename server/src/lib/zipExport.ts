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
    // Streaming failure happens mid-response, after headers are already
    // sent — throwing here is an uncaught exception in an async event
    // callback, which crashes the whole process (every in-flight request,
    // not just this one). Log and tear down just this connection instead.
    console.error('Idea export failed:', err);
    res.destroy(err);
  });
  archive.pipe(res);

  for (const photo of photos) {
    archive.file(photo.originalPath, { name: photo.filename });
  }

  return archive.finalize();
}
