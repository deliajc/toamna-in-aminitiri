// Shared limits and accepted formats (used by browser and server).

export const MB = 1024 * 1024;

export const MAX_IMAGE_BYTES = Number(process.env.NEXT_PUBLIC_MAX_IMAGE_MB || 40) * MB;
export const MAX_VIDEO_BYTES = Number(process.env.NEXT_PUBLIC_MAX_VIDEO_MB || 50) * MB;
export const MAX_FILES_PER_SUBMISSION = 30;

export const REQUIRE_CONSENT = process.env.NEXT_PUBLIC_REQUIRE_CONSENT === "true";
export const UPLOADS_CLOSED = process.env.NEXT_PUBLIC_UPLOADS_CLOSED === "true";

export const BUCKET = "event-media";

export type Kind = "image" | "video";

// mime -> [kind, canonical extension]
export const ALLOWED: Record<string, [Kind, string]> = {
  "image/jpeg": ["image", "jpg"],
  "image/png": ["image", "png"],
  "image/webp": ["image", "webp"],
  "image/gif": ["image", "gif"],
  "image/heic": ["image", "heic"],
  "image/heif": ["image", "heif"],
  "video/mp4": ["video", "mp4"],
  "video/quicktime": ["video", "mov"],
  "video/webm": ["video", "webm"],
  "video/3gpp": ["video", "3gp"],
  "video/x-m4v": ["video", "m4v"],
};

const EXT_TO_MIME: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  heic: "image/heic",
  heif: "image/heif",
  mp4: "video/mp4",
  mov: "video/quicktime",
  qt: "video/quicktime",
  webm: "video/webm",
  "3gp": "video/3gpp",
  m4v: "video/x-m4v",
};

/** Some phones report an empty or generic type; fall back to the extension. */
export function resolveMime(name: string, type: string): string | null {
  const t = (type || "").toLowerCase();
  if (ALLOWED[t]) return t;
  const ext = name.split(".").pop()?.toLowerCase() || "";
  return EXT_TO_MIME[ext] || null;
}

export function maxBytesFor(kind: Kind) {
  return kind === "image" ? MAX_IMAGE_BYTES : MAX_VIDEO_BYTES;
}

export function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < MB) return `${(n / 1024).toFixed(0)} KB`;
  const fmt = (v: number, d: number) => v.toFixed(d).replace(/\.?0+$/, "").replace(".", ",");
  if (n < 1024 * MB) return `${fmt(n / MB, 1)} MB`;
  return `${fmt(n / 1024 / MB, 2)} GB`;
}
