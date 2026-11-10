/** A one-page "print sheet" for a composition as a plain PDF: what to order, print by print. No dependency: it is text on a page. */

const esc = (s: string) => s.replace(/[^\x20-\x7e]/g, (c) => ({ '×': 'x', '″': '"', '·': '-', '–': '-', '—': '-', '’': "'", '‘': "'", '“': '"', '”': '"' } as Record<string, string>)[c] ?? '?').replace(/([\\()])/g, '\\$1');

export type SheetLine = { text: string; size?: number; bold?: boolean };

/** Lines run top to bottom on A4 (595 x 842 pt) and flow onto further pages when they run out. */
export function printSheetPdf(lines: SheetLine[]): Buffer {
  const pages: string[] = [];
  let cur = '', y = 800;
  const newPage = () => { if (cur) pages.push(cur); cur = ''; y = 800; };
  for (const l of lines) {
    const size = l.size ?? 11;
    if (y < 60) newPage();
    cur += `BT /${l.bold ? 'F2' : 'F1'} ${size} Tf 50 ${y} Td (${esc(l.text).slice(0, 110)}) Tj ET\n`;
    y -= size + 7;
  }
  newPage();
  const objs: string[] = [];
  const add = (s: string) => objs.push(s) && objs.length;
  add('<< /Type /Catalog /Pages 2 0 R >>');
  const kids = pages.map((_, i) => `${5 + i * 2} 0 R`).join(' ');
  add(`<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>`);
  add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>');
  pages.forEach((content, i) => {
    add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${6 + i * 2} 0 R >>`);
    add(`<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}endstream`);
  });
  let out = '%PDF-1.4\n';
  const offsets: number[] = [];
  objs.forEach((o, i) => { offsets.push(Buffer.byteLength(out)); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = Buffer.byteLength(out);
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}
