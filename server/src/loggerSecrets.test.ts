import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { expect, it } from 'vitest';
import { redactEmergencyCredentials } from './logger.js';

it('redacts emergency credentials in historical/rotated messages while retaining useful log text', () => {
  const user = crypto.randomBytes(10).toString('hex'), password = crypto.randomBytes(20).toString('hex');
  const line = `EMERGENCY LOGIN (one use): open /auth/emergency, username ${user} password ${password}`;
  const safe = redactEmergencyCredentials(`Ordinary diagnostic\n${line}\nAnother line`);
  expect(safe).not.toContain(user); expect(safe).not.toContain(password);
  expect(safe).toContain('Ordinary diagnostic'); expect(safe).toContain('Another line'); expect(safe).toContain('use Docker logs');
});
it('keeps terminal credentials even at errors-only level, while the app reader hides legacy secrets', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'frames-secret-log-'));
  const user = crypto.randomBytes(10).toString('hex'), password = crypto.randomBytes(20).toString('hex');
  const line = `EMERGENCY LOGIN (one use): open /auth/emergency, username ${user} password ${password}`;
  const script = `import fs from 'node:fs'; import zlib from 'node:zlib';
    import { buildApp } from ${JSON.stringify(pathToFileURL(path.join(__dirname, 'app.ts')).href)};
    import { openDb } from ${JSON.stringify(pathToFileURL(path.join(__dirname, 'db.ts')).href)};
    import { startLogger, serverOnlyLog, logFile, readLog } from ${JSON.stringify(pathToFileURL(path.join(__dirname, 'logger.ts')).href)};
    startLogger(${JSON.stringify(tmp)}, 'errors'); serverOnlyLog(${JSON.stringify(line)});
    fs.writeFileSync(logFile(), new Date().toISOString() + ' INFO ' + ${JSON.stringify(line)} + '\\n');
    const app = buildApp(openDb(${JSON.stringify(tmp)}), { dataDir: ${JSON.stringify(tmp)}, libraries: [], authDisabled: true });
    const tail = await app.inject('/api/admin/logs/tail'), plain = await app.inject('/api/admin/logs'), archive = await app.inject('/api/admin/logs/download');
    const zip = archive.rawPayload, offset = 30 + zip.readUInt16LE(26) + zip.readUInt16LE(28);
    const unzipped = zlib.inflateRawSync(zip.subarray(offset, offset + zip.readUInt32LE(18))).toString();
    process.stdout.write('APP_LOG=' + JSON.stringify({ reader: readLog().text, tail: tail.json(), plain: plain.body, archive: unzipped }));
    await app.close();`;
  try {
    const stdout = execFileSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', script], { cwd: path.join(__dirname, '..'), encoding: 'utf8' });
    expect(stdout.split('APP_LOG=')[0]).toContain(line);
    const appLog = JSON.parse(stdout.split('APP_LOG=')[1]);
    for (const text of [appLog.reader, JSON.stringify(appLog.tail), appLog.plain, appLog.archive]) {
      expect(text).not.toContain(user); expect(text).not.toContain(password); expect(text).toContain('use Docker logs');
    }
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});
