/**
 * File upload helper for ClassTrack.
 * Handles client-side file reading, image compression (<500KB),
 * and non-image payload encoding (<800KB).
 */

export interface ProcessedFile {
  name: string;
  dataUrl: string;
  size: number;
  type: string;
  isImage: boolean;
}

const MAX_IMAGE_SIZE_BYTES = 500 * 1024; // 500 KB
const MAX_FILE_SIZE_BYTES = 800 * 1024; // 800 KB

export async function processSelectedFile(file: File): Promise<ProcessedFile> {
  const isImage = file.type.startsWith('image/');

  if (isImage) {
    const compressedDataUrl = await compressImage(file);
    return {
      name: file.name,
      dataUrl: compressedDataUrl,
      size: Math.round((compressedDataUrl.length * 3) / 4),
      type: file.type || 'image/jpeg',
      isImage: true,
    };
  } else {
    if (file.size > MAX_FILE_SIZE_BYTES) {
      throw new Error(
        `File "${file.name}" is ${(file.size / 1024).toFixed(0)}KB, which exceeds the 800KB limit for attachments.`
      );
    }
    const dataUrl = await readFileAsDataUrl(file);
    return {
      name: file.name,
      dataUrl,
      size: file.size,
      type: file.type || 'application/octet-stream',
      isImage: false,
    };
  }
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = (err) => reject(err);
    reader.readAsDataURL(file);
  });
}

function compressImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let width = img.width;
        let height = img.height;
        const maxDimension = 1200;

        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(e.target?.result as string);
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);

        let quality = 0.85;
        let result = canvas.toDataURL('image/jpeg', quality);

        // Progressively reduce quality if still over 500KB
        while (result.length > MAX_IMAGE_SIZE_BYTES * 1.33 && quality > 0.3) {
          quality -= 0.15;
          result = canvas.toDataURL('image/jpeg', quality);
        }

        resolve(result);
      };
      img.onerror = () => reject(new Error('Failed to load image for compression'));
      img.src = e.target?.result as string;
    };
    reader.onerror = (err) => reject(err);
    reader.readAsDataURL(file);
  });
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
