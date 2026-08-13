import { Router } from 'express';
import path from 'node:path';
import db, { THUMBS_DIR, DISPLAY_DIR, REFERENCES_DIR } from '../db.js';
import type { IdeaReferenceRow, PhotoRow } from '../types.js';

export const filesRouter = Router();

filesRouter.get('/reference/:id', (req, res) => {
  const reference = db.prepare('SELECT * FROM idea_references WHERE id = ?').get(req.params.id) as IdeaReferenceRow | undefined;
  if (!reference || reference.kind !== 'image' || !reference.path) return res.status(404).json({ error: 'Reference image not found' });
  res.sendFile(path.join(REFERENCES_DIR, reference.path));
});

filesRouter.get('/:kind/:id', (req, res) => {
  const { kind, id } = req.params;
  if (kind !== 'thumb' && kind !== 'display') return res.status(400).json({ error: 'invalid kind' });

  const photo = db.prepare('SELECT * FROM photos WHERE id = ?').get(id) as PhotoRow | undefined;
  if (!photo) return res.status(404).json({ error: 'Photo not found' });

  const filename = kind === 'thumb' ? photo.thumb_path : photo.display_path;
  if (!filename) return res.status(404).json({ error: 'Derivative not ready' });

  const dir = kind === 'thumb' ? THUMBS_DIR : DISPLAY_DIR;
  res.sendFile(path.join(dir, filename));
});
