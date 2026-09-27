import * as multer from 'multer';
import { extname } from 'path';

const allowedExtensions = {
  '.heic': { mime: 'image/heic', kind: 'image' },
  '.mp4': { mime: 'video/mp4', kind: 'video' },
  '.mov': { mime: 'video/quicktime', kind: 'video' },
  '.m4a': { mime: 'audio/mp4', kind: 'audio' },
  '.aac': { mime: 'audio/aac', kind: 'audio' },
  '.mp3': { mime: 'audio/mpeg', kind: 'audio' },
  '.ogg': { mime: 'audio/ogg', kind: 'audio' },
  '.opus': { mime: 'audio/opus', kind: 'audio' },
  '.wav': { mime: 'audio/wav', kind: 'audio' },
  '.webm': { mime: 'video/webm', kind: 'video' },
  '.docx': { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', kind: 'document' },
  '.xlsx': { mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', kind: 'document' },
  '.pptx': { mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', kind: 'document' },
  '.txt': { mime: 'text/plain', kind: 'document' },
  '.zip': { mime: 'application/zip', kind: 'document' },
};

const fileFilter = (req, file, cb) => {
  const ext = extname(file.originalname).toLowerCase();
  if (allowedExtensions[ext]) {
    cb(null, true);
  } else {
    cb(new Error('Unsupported file type'), false);
  }
};

const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100 MB limit
  fileFilter: fileFilter,
});

export { upload, allowedExtensions };