import { CryptoService } from './crypto.service';
import { AppConfig } from '../config/app-config';

describe('CryptoService', () => {
  const svc = new CryptoService({ encryptionKeyHex: 'ab'.repeat(32) } as AppConfig);

  it('cifra y descifra', () => {
    const enc = svc.encrypt('0xsecreto');
    expect(enc.startsWith('v1.')).toBe(true);
    expect(enc).not.toContain('secreto');
    expect(svc.decrypt(enc)).toBe('0xsecreto');
  });

  it('usa un IV distinto cada vez', () => {
    expect(svc.encrypt('x')).not.toBe(svc.encrypt('x'));
  });

  it('detecta manipulaciones', () => {
    const [v, iv, tag, data] = svc.encrypt('hola').split('.');
    const tampered = [v, iv, tag, Buffer.from('adios').toString('base64')].join('.');
    expect(() => svc.decrypt(tampered)).toThrow();
    expect(() => svc.decrypt('basura')).toThrow();
    void data;
  });

  it('calcula sha256', () => {
    expect(svc.sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
});
