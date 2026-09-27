import { chatContentMatches, chatMimeFor, attachmentLabel } from './chat-attachments';

describe('chat-attachments', () => {
  describe('chatContentMatches', () => {
    it('accepts real signatures for jpeg files', () => {
      expect(chatContentMatches(Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]), 'image/jpeg')).toBe(true);
    });

    it('accepts real signatures for heic files', () => {
      expect(chatContentMatches(Buffer.from([0x00, 0x00, 0x00, 0x1C, 0x66, 0x74, 0x79, 0x70, 0x66, 0x74, 0x79, 0x70]), 'image/heic')).toBe(true);
    });

    it('accepts real signatures for mp4 files', () => {
      expect(chatContentMatches(Buffer.from([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x6D, 0x70, 0x34, 0x32]), 'video/mp4')).toBe(true);
    });

    it('accepts real signatures for m4a files', () => {
      expect(chatContentMatches(Buffer.from([0xFF, 0xFA, 0xF3, 0xE1]), 'audio/mp4a.40.2')).toBe(true);
    });

    it('accepts real signatures for ogg files', () => {
      expect(chatContentMatches(Buffer.from([0x4F, 0x67, 0x67, 0x53, 0x00, 0x02, 0x00, 0x00, 0x00, 0x0A]), 'audio/ogg')).toBe(true);
    });

    it('accepts real signatures for pdf files', () => {
      expect(chatContentMatches(Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2D, 0x31, 0x2E]), 'application/pdf')).toBe(true);
    });

    it('accepts real signatures for docx files', () => {
      expect(chatContentMatches(Buffer.from([0x50, 0x4B, 0x03, 0x04, 0x14, 0x00, 0x00, 0x00, 0x00, 0x00]), 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')).toBe(true);
    });

    it('accepts real signatures for zip files', () => {
      expect(chatContentMatches(Buffer.from([0x50, 0x4B, 0x03, 0x04, 0x0A, 0x00, 0x00, 0x00, 0x00, 0x00]), 'application/zip')).toBe(true);
    });

    it('accepts real signatures for txt files', () => {
      expect(chatContentMatches(Buffer.from([0x68, 0x65, 0x6C, 0x6C, 0x6F]), 'text/plain')).toBe(true);
    });

    it('rejects renamed files', () => {
      expect(chatContentMatches(Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]), 'image/png')).toBe(false);
    });
  });

  describe('chatMimeFor', () => {
    it('returns video/webm for audio files with webm extension', () => {
      expect(chatMimeFor('audio.webm')).toBe('video/webm');
    });

    it('returns video/webm for video files with webm extension', () => {
      expect(chatMimeFor('video.webm')).toBe('video/webm');
    });
  });

  describe('attachmentLabel', () => {
    it('returns "Photo" for photo attachments', () => {
      expect(attachmentLabel('image/jpeg')).toBe('Photo');
    });

    it('returns "Video" for video attachments', () => {
      expect(attachmentLabel('video/mp4')).toBe('Video');
    });

    it('returns "Voice Note" for voice note attachments', () => {
      expect(attachmentLabel('audio/mp4a.40.2')).toBe('Voice Note');
    });

    it('returns "Document" for document attachments', () => {
      expect(attachmentLabel('application/pdf')).toBe('Document');
    });
  });
});