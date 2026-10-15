import { NextResponse } from "next/server";
import { BUCKET } from "@/lib/config";
import { db, serviceKey, supabaseUrl } from "@/lib/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Diagnostic: reports only yes/no checks and error messages, never secrets.
export async function GET() {
  const url = supabaseUrl();
  const key = serviceKey();
  const out: Record<string, unknown> = {
    supabaseUrl: /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(url) ? "ok" : url
      ? `GREȘIT: trebuie să fie de forma https://abcd.supabase.co (acum începe cu „${url.slice(0, 12)}…”)`
      : "lipsește",
    serviceKey: !key
      ? "lipsește"
      : key.startsWith("sb_secret_") || (key.startsWith("eyJ") && key.length > 100)
      ? "ok"
      : key.startsWith("sb_publishable_")
      ? "GREȘIT: este cheia publishable, trebuie cheia secret"
      : `GREȘIT: nu pare cheia secret (începe cu „${key.slice(0, 4)}…”, are ${key.length} caractere; trebuie să înceapă cu „sb_secret_”)`,
    adminPassword: (process.env.ADMIN_PASSWORD || "").length >= 10 ? "ok" : "lipsește sau prea scurtă",
    sessionSecret: (process.env.SESSION_SECRET || "").length >= 32 ? "ok" : "lipsește sau prea scurt",
  };
  try {
    const t = await db().from("media").select("id", { count: "exact", head: true });
    out.table = t.error ? `eroare: ${t.error.message || t.error.code || t.status}` : "ok";
    const b = await db().storage.getBucket(BUCKET);
    out.bucket = b.error ? `eroare: ${b.error.message}` : b.data?.public ? "ATENȚIE: bucket public" : "ok (privat)";
    const s = await db().storage.from(BUCKET).createSignedUploadUrl(`_test/${Date.now()}.jpg`);
    out.signedUpload = s.error ? `eroare: ${s.error.message}` : "ok";
  } catch (e) {
    out.connection = `eroare: ${(e as Error).message}`;
  }
  return NextResponse.json(out, { headers: { "cache-control": "no-store" } });
}
