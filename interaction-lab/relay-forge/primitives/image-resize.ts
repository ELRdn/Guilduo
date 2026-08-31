/**
 * Client-side avatar resize — the one implementation shared by the Account
 * avatar picker and the Agent avatar picker in the shared Agent Dialog.
 *
 * Nothing here is a security boundary: the file is decoded, fit inside a
 * 256x256 box without upscaling, and re-encoded as WebP purely to keep the
 * upload small and the aspect ratio sane. The server independently
 * re-validates Content-Type, real image format and byte size — this module
 * only has to get that right for the common case, not the adversarial one.
 */

const ACCEPTED_TYPES: ReadonlySet<string> = new Set(["image/png", "image/jpeg", "image/webp"]);
const MAX_DIMENSION = 256;
/** Headroom before decode. Not the stored size — that limit is the server's. */
const MAX_SOURCE_BYTES = 8 * 1024 * 1024;

export class AvatarImageError extends Error {}

export interface ResizedAvatar {
  /** WebP bytes, for a binary upload (Agent avatar → R2). */
  readonly blob: Blob;
  /** Local-only preview; profile avatars are uploaded as binary bytes too. */
  readonly dataUrl: string;
}

/**
 * Decodes `file`, fits it inside a 256x256 box (preserving aspect ratio,
 * never upscaling), and re-encodes as WebP. Rejects anything that is not
 * PNG/JPEG/WebP by declared type, and anything that fails to decode as an
 * image at all — including a renamed non-image file.
 */
export async function resizeAvatarImage(file: File): Promise<ResizedAvatar> {
  if (!ACCEPTED_TYPES.has(file.type)) {
    throw new AvatarImageError("PNG、JPEG、WebPの画像を選択してください。");
  }
  if (file.size > MAX_SOURCE_BYTES) {
    throw new AvatarImageError("画像が大きすぎます。8MB以下のファイルを選択してください。");
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new AvatarImageError("画像を読み込めませんでした。別のファイルをお試しください。");
  }

  try {
    const scale = Math.min(1, MAX_DIMENSION / bitmap.width, MAX_DIMENSION / bitmap.height);
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (context === null) throw new AvatarImageError("画像を処理できませんでした。");
    context.drawImage(bitmap, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.85));
    if (blob === null) throw new AvatarImageError("画像を変換できませんでした。");

    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new AvatarImageError("画像を変換できませんでした。"));
      reader.readAsDataURL(blob);
    });

    return { blob, dataUrl };
  } finally {
    bitmap.close();
  }
}
