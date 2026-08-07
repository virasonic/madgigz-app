// Mock-phase content media limit - real object storage (Phase 3 backend)
// removes this ceiling. Kept conservative since everything here lives in
// localStorage.
export const MAX_CONTENT_FILE_BYTES = 2 * 1024 * 1024;

export function mediaTypeForFile(file: File): "image" | "video" | null {
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("video/")) return "video";
  return null;
}

export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
