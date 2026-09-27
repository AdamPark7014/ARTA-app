import { chatPreview, dmKeyOf, mentionedUserIds, mentionsChannel, pushText, slugify } from './chat-text';

describe('chat-text', () => {
  it('muestra menciones y enlaces por su etiqueta', () => {
    expect(chatPreview('Hola [@Ana Ruiz](user:abc123), mira [el PDF](/uploads/x.pdf)')).toBe(
      'Hola @Ana Ruiz, mira el PDF',
    );
  });

  it('recorta la vista previa con puntos suspensivos', () => {
    const long = 'a'.repeat(300);
    const out = chatPreview(long);
    expect(out).toHaveLength(140);
    expect(out.endsWith('…')).toBe(true);
  });

  it('junta saltos de línea en la vista previa', () => {
    expect(chatPreview('uno\n\n  dos')).toBe('uno dos');
  });

  it('detecta mencionados sin el autor y sin repetir', () => {
    const ids = mentionedUserIds('[@Ana](user:u1) [@Luis](user:u2) [@Luis](user:u2)', 'u1');
    expect([...ids]).toEqual(['u2']);
  });

  it('detecta @canal y @todos, no un correo', () => {
    expect(mentionsChannel('@canal junta a las 5')).toBe(true);
    expect(mentionsChannel('aviso @todos')).toBe(true);
    expect(mentionsChannel('escribe a prensa@canal.com')).toBe(false);
  });

  it('arma slugs sin acentos', () => {
    expect(slugify('Producción Auditorio Ñ')).toBe('produccion-auditorio-n');
  });

  it('la llave del directo no depende del orden', () => {
    expect(dmKeyOf('b2', 'a1')).toBe('a1:b2');
    expect(dmKeyOf('a1', 'b2')).toBe('a1:b2');
  });

  it('describe adjuntos en el aviso', () => {
    expect(pushText({ body: '', attachmentUrl: '/uploads/1.jpg', attachmentName: 'foto.jpg' })).toBe('📷 Foto');
    expect(pushText({ body: '', attachmentUrl: '/uploads/2.pdf', attachmentName: 'x.pdf' })).toBe('📄 x.pdf');
    expect(pushText({ body: 'listo', attachmentUrl: '/uploads/1.png', attachmentName: null })).toBe('📷 Foto · listo');
    expect(pushText({ body: '', attachmentUrl: '/uploads/3.m4a', attachmentName: 'nota-de-voz.m4a', attachmentMime: 'audio/mp4' })).toBe(
      '🎤 Nota de voz',
    );
  });
});
