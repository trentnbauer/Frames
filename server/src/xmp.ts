import fs from 'node:fs';
import path from 'node:path';

export type XmpData = { title: string; description: string; keywords: string[]; rating: number | null };
export const MARKER = 'Frames';

const unesc = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
export const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** A language-alternative value (dc:title, dc:description) is <rdf:Alt><rdf:li>text</rdf:li></rdf:Alt>. */
function altText(xml: string, tag: string): string {
  const m = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i').exec(xml);
  if (!m) return '';
  const li = /<rdf:li[^>]*>([\s\S]*?)<\/rdf:li>/i.exec(m[1]);
  return unesc((li ? li[1] : m[1]).trim());
}

/** Reads the few fields Frames understands. Anything else in the sidecar is ignored, never rewritten. */
export function parseXmp(xml: string): XmpData {
  const subject = /<dc:subject[^>]*>([\s\S]*?)<\/dc:subject>/i.exec(xml);
  const keywords = subject ? [...subject[1].matchAll(/<rdf:li[^>]*>([\s\S]*?)<\/rdf:li>/gi)].map((m) => unesc(m[1].trim())).filter(Boolean) : [];
  const rating = /xmp:Rating\s*=\s*"(-?\d)"/i.exec(xml)?.[1] ?? /<xmp:Rating>(-?\d)<\/xmp:Rating>/i.exec(xml)?.[1];
  const r = rating === undefined ? null : Number(rating);
  return { title: altText(xml, 'dc:title'), description: altText(xml, 'dc:description'), keywords, rating: r !== null && r >= 1 && r <= 5 ? r : null };
}

/** Where a sidecar for this original would live: photo.jpg.xmp, or photo.xmp (Lightroom/Capture One style). */
export function sidecarCandidates(file: string): string[] {
  const dir = path.dirname(file);
  return [`${file}.xmp`, path.join(dir, path.basename(file, path.extname(file)) + '.xmp')];
}
export function findSidecar(file: string): string | null {
  for (const c of sidecarCandidates(file)) if (fs.existsSync(c)) return c;
  return null;
}
export function readSidecar(file: string): XmpData | null {
  const f = findSidecar(file);
  if (!f) return null;
  try { return parseXmp(fs.readFileSync(f, 'utf8').slice(0, 2_000_000)); } catch { return null; }
}

/** An XMP packet with only metadata the user has approved. The original image is never touched. */
export function buildXmp(m: { title: string; description: string; keywords: string[]; rating?: number | null }): string {
  const lines = [
    '<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>',
    `<x:xmpmeta xmlns:x="adobe:ns:meta/" x:xmptk="${MARKER}">`,
    ' <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">',
    `  <rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:xmp="http://ns.adobe.com/xap/1.0/"${m.rating ? ` xmp:Rating="${m.rating}"` : ''}>`,
  ];
  if (m.title) lines.push(`   <dc:title><rdf:Alt><rdf:li xml:lang="x-default">${esc(m.title)}</rdf:li></rdf:Alt></dc:title>`);
  if (m.description) lines.push(`   <dc:description><rdf:Alt><rdf:li xml:lang="x-default">${esc(m.description)}</rdf:li></rdf:Alt></dc:description>`);
  if (m.keywords.length) lines.push(`   <dc:subject><rdf:Bag>${m.keywords.map((k) => `<rdf:li>${esc(k)}</rdf:li>`).join('')}</rdf:Bag></dc:subject>`);
  lines.push('  </rdf:Description>', ' </rdf:RDF>', '</x:xmpmeta>', '<?xpacket end="w"?>', '');
  return lines.join('\n');
}

export const isOurs = (xml: string) => xml.includes(`x:xmptk="${MARKER}"`);
