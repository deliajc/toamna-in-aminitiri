import "server-only";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { createHash, createHmac, timingSafeEqual } from "crypto";
import { cookies, headers } from "next/headers";
import { BUCKET } from "./config";

/* ---------- Supabase (service role, server only) ---------- */

let client: SupabaseClient | null = null;

export function db(): SupabaseClient {
  if (!client) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error("Lipsesc SUPABASE_URL sau SUPABASE_SERVICE_ROLE_KEY.");
    client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  }
  return client;
}

export const storage = () => db().storage.from(BUCKET);

/* ---------- Client identity (hashed, never stored raw) ---------- */

export async function clientIp(): Promise<string> {
  const h = await headers();
  return (
    h.get("x-forwarded-for")?.split(",")[0].trim() ||
    h.get("x-real-ip") ||
    "unknown"
  );
}

export function hashIp(ip: string) {
  return createHash("sha256").update(ip + "|" + secret()).digest("hex").slice(0, 32);
}

/* ---------- Burst limiter (per server instance) ---------- */

const buckets = new Map<string, { n: number; reset: number }>();

export function burstLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.reset < now) {
    buckets.set(key, { n: 1, reset: now + windowMs });
    if (buckets.size > 5000) for (const [k, v] of buckets) if (v.reset < now) buckets.delete(k);
    return true;
  }
  b.n++;
  return b.n <= max;
}

/* ---------- Admin session ---------- */

const COOKIE = "adm_session";
const SESSION_HOURS = 12;

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("SESSION_SECRET trebuie să aibă cel puțin 32 de caractere.");
  return s;
}

function sign(value: string) {
  return createHmac("sha256", secret()).update(value).digest("hex");
}

function safeEqual(a: string, b: string) {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

/** Proof that a given upload id was issued to this browser (survives network changes). */
export function ticketFor(id: string) {
  return sign("upload:" + id).slice(0, 40);
}
export function checkTicket(id: string, ticket: string) {
  return typeof ticket === "string" && safeEqual(ticket, ticketFor(id));
}

export function checkPassword(input: string) {
  const expected = process.env.ADMIN_PASSWORD || "";
  if (expected.length < 10) return false;
  // Compare hashes so length differences don't leak.
  const h = (s: string) => createHash("sha256").update(s).digest("hex");
  return safeEqual(h(input), h(expected));
}

export async function createSession() {
  const exp = Date.now() + SESSION_HOURS * 3600_000;
  const value = `${exp}.${sign(String(exp))}`;
  (await cookies()).set(COOKIE, value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: SESSION_HOURS * 3600,
  });
}

export async function destroySession() {
  (await cookies()).delete(COOKIE);
}

export async function isAdmin(): Promise<boolean> {
  try {
    const v = (await cookies()).get(COOKIE)?.value;
    if (!v) return false;
    const [exp, sig] = v.split(".");
    if (!exp || !sig || Number(exp) < Date.now()) return false;
    return safeEqual(sig, sign(exp));
  } catch {
    return false;
  }
}

/* ---------- Content verification (magic bytes) ---------- */

const HEIF_BRANDS = ["heic", "heix", "hevc", "heim", "heis", "hevm", "hevs", "mif1", "msf1", "avif"];

export function looksValid(mime: string, b: Uint8Array): boolean {
  if (b.length < 12) return false;
  const ascii = (s: number, e: number) => String.fromCharCode(...b.slice(s, e));
  switch (mime) {
    case "image/jpeg":
      return b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
    case "image/png":
      return b[0] === 0x89 && ascii(1, 4) === "PNG";
    case "image/gif":
      return ascii(0, 4) === "GIF8";
    case "image/webp":
      return ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP";
    case "image/heic":
    case "image/heif":
      return ascii(4, 8) === "ftyp" && HEIF_BRANDS.includes(ascii(8, 12));
    case "video/webm":
      return b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3;
    case "video/quicktime":
      return ["ftyp", "moov", "wide", "mdat", "free", "skip", "pnot"].includes(ascii(4, 8));
    case "video/mp4":
    case "video/3gpp":
    case "video/x-m4v":
      return ascii(4, 8) === "ftyp" && !HEIF_BRANDS.includes(ascii(8, 12));
    default:
      return false;
  }
}

export type MediaRow = {
  id: string;
  path: string;
  kind: "image" | "video";
  mime: string;
  size: number;
  status: "pending" | "ready" | "rejected";
  created_at: string;
};

/**
 * Confirms an upload really landed in storage and contains what it claims to.
 * Invalid objects are deleted. Returns the final status.
 */
export async function verifyUpload(row: MediaRow): Promise<MediaRow["status"] | "missing"> {
  const dir = row.path.substring(0, row.path.lastIndexOf("/"));
  const name = row.path.substring(row.path.lastIndexOf("/") + 1);
  const { data: list } = await storage().list(dir, { search: name, limit: 1 });
  const obj = list?.find((o) => o.name === name);
  if (!obj) return "missing";

  const size = Number(obj.metadata?.size ?? 0);
  const { data: signed } = await storage().createSignedUrl(row.path, 60);
  let ok = false;
  if (signed?.signedUrl) {
    try {
      const res = await fetch(signed.signedUrl, { headers: { Range: "bytes=0-31" } });
      ok = looksValid(row.mime, new Uint8Array(await res.arrayBuffer()).slice(0, 32));
    } catch {
      ok = false;
    }
  }

  if (!ok) {
    await storage().remove([row.path]);
    await db().from("media").update({ status: "rejected", size }).eq("id", row.id);
    return "rejected";
  }
  await db().from("media").update({ status: "ready", size }).eq("id", row.id);
  return "ready";
}
