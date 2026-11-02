import { api } from './api';

/** Lado mayor de una foto del sitio: cubre una pantalla grande y deja el archivo ligero. */
const MAX_SIDE = 2400;
const MAX_VIDEO_MB = 120;

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('No se pudo leer la imagen'));
    };
    img.src = url;
  });
}

/**
 * El sitio sirve las fotos tal cual (`images.unoptimized`): una foto de teléfono de 8 MB la
 * descargaría completa cada visitante. Se reduce aquí, antes de subirla. Los PNG chicos se quedan
 * como están porque los logos necesitan su fondo transparente.
 */
async function shrinkImage(file: File): Promise<File> {
  const isPng = file.type === 'image/png';
  if (file.type === 'image/gif' || (isPng && file.size < 2_500_000)) return file;
  try {
    const img = await loadImage(file);
    const longest = Math.max(img.naturalWidth, img.naturalHeight);
    if (longest <= MAX_SIDE && file.size < 1_500_000) return file;
    const scale = Math.min(1, MAX_SIDE / longest);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.86));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], `${file.name.replace(/\.[^.]+$/, '') || 'foto'}.jpg`, { type: 'image/jpeg' });
  } catch {
    return file;
  }
}

export type UploadedMedia = { url: string; type: 'image' | 'video' };

/** Sube una foto o un video del sitio. El mensaje de error ya viene listo para enseñarse. */
export async function uploadSiteMedia(file: File, opts: { allowVideo?: boolean } = {}): Promise<UploadedMedia> {
  const name = file.name.toLowerCase();
  const video = file.type.startsWith('video/') || /\.(mp4|m4v|mov|webm)$/.test(name);
  if (video && !opts.allowVideo) throw new Error('Aquí va una foto, no un video.');
  if (/\.(heic|heif)$/.test(name) || /image\/hei[cf]/.test(file.type)) {
    // Chrome y Android no las abren: el visitante vería un cuadro roto.
    throw new Error('Esa foto está en formato HEIC del iPhone y no se ve en todos los navegadores. Compártela como JPG y súbela otra vez.');
  }
  if (video && file.size > MAX_VIDEO_MB * 1024 * 1024) {
    throw new Error(`El video pesa más de ${MAX_VIDEO_MB} MB: recórtalo o bájale la calidad para que el sitio no se haga lento.`);
  }
  const ready = video ? file : await shrinkImage(file);
  const fd = new FormData();
  fd.append('file', ready);
  fd.append('kind', video ? 'video' : 'image');
  const res = await api<{ url: string }>('/uploads', { method: 'POST', body: fd });
  return { url: res.url, type: video ? 'video' : 'image' };
}
