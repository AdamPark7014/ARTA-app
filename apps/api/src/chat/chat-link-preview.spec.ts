import { isPrivateAddress, parseLinkPreview, publicUrl } from './chat-link-preview';

const resolveTo = (address: string) => async () => [{ address }];

describe('vista previa de enlaces (SSRF)', () => {
  it.each([
    '127.0.0.1',
    '10.1.2.3',
    '172.16.0.9',
    '172.31.255.255',
    '192.168.9.32',
    '169.254.169.254',
    '100.71.203.3',
    '0.0.0.0',
    '224.0.0.1',
    '255.255.255.255',
    '::1',
    '::',
    'fe80::1',
    'fd12:3456::1',
    '::ffff:127.0.0.1',
    '::ffff:7f00:1',
    '64:ff9b::a00:1',
    'no-es-ip',
  ])('rechaza %s', (ip) => {
    expect(isPrivateAddress(ip)).toBe(true);
  });

  it.each(['8.8.8.8', '1.1.1.1', '172.32.0.1', '2606:4700:4700::1111', '::ffff:8.8.8.8'])('acepta %s', (ip) => {
    expect(isPrivateAddress(ip)).toBe(false);
  });

  it('solo http/https, sin credenciales ni puertos raros', async () => {
    const ok = resolveTo('93.184.216.34');
    await expect(publicUrl('ftp://example.com/x', ok)).resolves.toBeNull();
    await expect(publicUrl('file:///etc/passwd', ok)).resolves.toBeNull();
    await expect(publicUrl('http://user:pw@example.com/', ok)).resolves.toBeNull();
    await expect(publicUrl('http://example.com:6379/', ok)).resolves.toBeNull();
    await expect(publicUrl('https://example.com/nota', ok)).resolves.toBeInstanceOf(URL);
  });

  it('rechaza IP privada literal y nombres que resuelven a la red interna', async () => {
    const ok = resolveTo('93.184.216.34');
    await expect(publicUrl('http://127.0.0.1/admin', ok)).resolves.toBeNull();
    await expect(publicUrl('http://[::1]:80/', ok)).resolves.toBeNull();
    await expect(publicUrl('http://169.254.169.254/latest/meta-data', ok)).resolves.toBeNull();
    await expect(publicUrl('http://localhost/', ok)).resolves.toBeNull();
    await expect(publicUrl('http://nas.local/', ok)).resolves.toBeNull();
    await expect(publicUrl('http://intranet.example.com/', resolveTo('192.168.9.34'))).resolves.toBeNull();
    await expect(
      publicUrl('http://mixto.example.com/', async () => [{ address: '8.8.8.8' }, { address: '10.0.0.1' }]),
    ).resolves.toBeNull();
  });

  it('lee og:*, cae a <title> y vuelve absoluta la imagen', () => {
    const page = new URL('https://www.example.com/shows/1');
    const html = `<html><head><title>Respaldo</title>
      <meta property="og:title" content="Concierto &amp; más">
      <meta name="description" content="Fechas y boletos">
      <meta property="og:image" content="/img/cartel.jpg"></head></html>`;
    expect(parseLinkPreview(html, page)).toEqual({
      url: 'https://www.example.com/shows/1',
      title: 'Concierto & más',
      description: 'Fechas y boletos',
      image: 'https://www.example.com/img/cartel.jpg',
      siteName: 'example.com',
    });
    expect(parseLinkPreview('<title> Solo título </title>', page)?.title).toBe('Solo título');
    expect(parseLinkPreview('<html><body>nada</body></html>', page)).toBeNull();
  });
});
