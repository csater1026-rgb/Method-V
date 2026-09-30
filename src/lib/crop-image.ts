// In the browser: crop a picked image to a centered width×height rectangle
// and shrink it to a JPEG, so only a small file is uploaded. Used for profile
// header pictures and app cover images.
export const MAX_IMAGE_BYTES = 15 * 1024 * 1024;

export async function cropToJpeg(file: File, width: number, height: number, quality = 0.85): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(bitmap.width / width, bitmap.height / height);
  const w = width * scale;
  const h = height * scale;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no canvas");
  ctx.drawImage(bitmap, (bitmap.width - w) / 2, (bitmap.height - h) / 2, w, h, 0, 0, width, height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
  if (!blob) throw new Error("no blob");
  return blob;
}

// Shrink a picked image (a screenshot) so its longest side is at most maxSide,
// keeping its shape, as a JPEG.
export async function shrinkToJpeg(file: File, maxSide = 1600, quality = 0.82): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no canvas");
  // Screenshots with see-through parts would turn black as a JPEG.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
  if (!blob) throw new Error("no blob");
  return blob;
}

// A friendly problem with the picked file, or null if it's fine.
export function imageProblem(file: File): string | null {
  if (!file.type.startsWith("image/")) return "Pick an image file (JPG, PNG, HEIC or WebP).";
  if (file.size > MAX_IMAGE_BYTES) return "That image is over 15 MB. Pick a smaller one.";
  return null;
}
