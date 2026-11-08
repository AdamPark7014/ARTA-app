import { isPublicUpload } from './static-access';

describe('isPublicUpload', () => {
  it('root images are public', () => {
    expect(isPublicUpload('/uploads/1700-abc.jpg')).toBe(true);
    expect(isPublicUpload('/uploads/seed-hero-1.JPG')).toBe(true);
    expect(isPublicUpload('/uploads/x.webp')).toBe(true);
  });
  it('site images (portada y galería) are public, nothing else in site/', () => {
    expect(isPublicUpload('/uploads/site/portada-1.jpg')).toBe(true);
    expect(isPublicUpload('/uploads/site/galeria/foto.webp')).toBe(true);
    expect(isPublicUpload('/uploads/site/contrato.pdf')).toBe(false);
    expect(isPublicUpload('/uploads/site/../chat/x.jpg')).toBe(false);
    expect(isPublicUpload('/uploads/sitex/x.jpg')).toBe(false);
    expect(isPublicUpload('/uploads/legal/aviso.pdf')).toBe(false);
  });
  it('documents, media and subfolders are private', () => {
    expect(isPublicUpload('/uploads/oc-1.pdf')).toBe(false);
    expect(isPublicUpload('/uploads/x.xlsx')).toBe(false);
    expect(isPublicUpload('/uploads/x.svg')).toBe(false);
    expect(isPublicUpload('/uploads/x.mp4')).toBe(false);
    expect(isPublicUpload('/uploads/chat/x.jpg')).toBe(false);
    expect(isPublicUpload('/uploads/testigos/x.jpg')).toBe(false);
    expect(isPublicUpload('/uploads/../x.jpg')).toBe(false);
    expect(isPublicUpload('/uploads/')).toBe(false);
    expect(isPublicUpload('/other/x.jpg')).toBe(false);
  });
});
