import { chatPreview, mentionedUserIds, mentionsChannel, slugify, dmKeyOf, pushText } from './chat-text';

describe('chatPreview', () => {
  it('converts [@Ana Ruiz](user:abc123) to @Ana Ruiz and truncates to 140 with ellipsis', () => {
    const text = 'Hola [@Ana Ruiz](user:abc123), esto es un texto muy largo que necesita ser truncado...';
    expect(chatPreview(text)).toBe('Hola @Ana Ruiz, esto es un texto muy largo que necesita ser trun...');
  });
});

describe('mentionedUserIds', () => {
  it('excludes author and dedupes', () => {
    const text = 'Hola [@Ana Ruiz](user:abc123), [@Juan](user:def456), [@Ana Ruiz](user:abc123)';
    expect(mentionedUserIds(text, 'user:abc123')).toEqual(['def456']);
  });
});

describe('mentionsChannel', () => {
  it('detects @canal and @todos but not email@canal.com', () => {
    expect(mentionsChannel('Hola @canal, @todos, pero no email@canal.com')).toEqual(['@canal', '@todos']);
  });
});

describe('slugify', () => {
  it('strips accents', () => {
    expect(slugify('Éxito')).toBe('exito');
  });
});

describe('dmKeyOf', () => {
  it('is order independent', () => {
    expect(dmKeyOf('user1', 'user2')).toBe(dmKeyOf('user2', 'user1'));
  });
});

describe('pushText', () => {
  it('returns Foto for .jpg attachment', () => {
    expect(pushText('test.jpg')).toBe('Foto');
  });
  it('returns Archivo: x.pdf for pdf', () => {
    expect(pushText('test.pdf')).toBe('Archivo: test.pdf');
  });
});