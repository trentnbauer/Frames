import { describe, expect, it } from 'vitest';
import { assertPublicEndpoint, isInternalIp } from './aisources.js';

describe('a member\'s own AI address', () => {
  it('recognises addresses that only this server or its network can reach', () => {
    for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.5', '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', '::', 'fd00::1', 'fe80::1', '::ffff:127.0.0.1']) expect(isInternalIp(ip), ip).toBe(true);
    for (const ip of ['8.8.8.8', '172.32.0.1', '169.253.0.1', '100.128.0.1', '2606:4700::1111']) expect(isInternalIp(ip), ip).toBe(false);
  });
  it('refuses internal addresses and names, and lets a public one through', async () => {
    for (const u of ['http://localhost:11434', 'http://127.0.0.1:3000', 'http://169.254.169.254/latest', 'http://[::1]:8080', 'http://nas', 'http://ollama.local', 'http://192.168.1.10:11434']) await expect(assertPublicEndpoint(u), u).rejects.toThrow(/public internet/);
    await expect(assertPublicEndpoint('https://8.8.8.8')).resolves.toBeUndefined();
    await expect(assertPublicEndpoint('')).resolves.toBeUndefined();
  });
});
