import fs from 'node:fs';

/**
 * How a preview or thumbnail is sent. Its address is only the photograph's number, so a browser (or anything between) that kept an
 * image under that address when the number meant a different photograph would go on showing the wrong picture. So it is never kept
 * without asking: every request is checked against a tag made from the photograph's own content hash and the file's size and time
 * ("it is still this one": a short 304), and a different photograph, or a rebuilt file, always has a different tag.
 */
export function serveDerivative(req: { headers: Record<string, unknown> }, rep: any, file: string, hash: string, kind: string, scope: 'private' | 'public' = 'private') {
  const st = fs.statSync(file);
  const tag = `"${hash.slice(0, 16)}-${kind}-${st.size}-${Math.round(st.mtimeMs)}"`;
  rep.header('ETag', tag).header('Cache-Control', `${scope}, no-cache`);
  if (String(req.headers['if-none-match'] ?? '') === tag) return rep.code(304).send();
  return rep.type('image/jpeg').send(fs.createReadStream(file));
}
