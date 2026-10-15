import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { ALLOWED, UPLOADS_CLOSED, maxBytesFor, resolveMime, formatBytes } from "@/lib/config";
import { burstLimit, clientIp, db, hashIp, storage, ticketFor } from "@/lib/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PER_IP_10MIN = Number(process.env.RATE_PER_IP_10MIN || 400); // generos: elevii pot fi în aceeași rețea Wi-Fi
const GLOBAL_PER_HOUR = Number(process.env.RATE_GLOBAL_PER_HOUR || 6000);
const MAX_TOTAL_FILES = Number(process.env.MAX_TOTAL_FILES || 20000);

const err = (message: string, status: number) => NextResponse.json({ error: message }, { status });

export async function POST(req: Request) {
  if (UPLOADS_CLOSED) return err("Încărcările s-au încheiat. Mulțumim!", 403);

  // Same-origin only (browser uploads from our own page).
  const origin = req.headers.get("origin");
  const host = req.headers.get("host");
  if (origin && host && new URL(origin).host !== host) return err("Cerere respinsă.", 403);

  let body: { name?: unknown; type?: unknown; size?: unknown };
  try {
    body = await req.json();
  } catch {
    return err("Cerere invalidă.", 400);
  }
  const name = typeof body.name === "string" ? body.name.slice(0, 255) : "";
  const type = typeof body.type === "string" ? body.type.slice(0, 100) : "";
  const size = typeof body.size === "number" ? body.size : -1;

  const mime = resolveMime(name, type);
  if (!mime) return err("Acest tip de fișier nu este acceptat. Trimite fotografii sau videoclipuri.", 415);
  const [kind, ext] = ALLOWED[mime];
  if (size <= 0) return err("Fișierul pare gol.", 400);
  if (size > maxBytesFor(kind))
    return err(`Fișierul depășește limita de ${formatBytes(maxBytesFor(kind))}.`, 413);

  const ipHash = hashIp(await clientIp());
  if (!burstLimit(ipHash, 60, 10_000)) return err("Prea multe cereri. Încearcă din nou în câteva secunde.", 429);

  const supa = db();
  const since10 = new Date(Date.now() - 10 * 60_000).toISOString();
  const since60 = new Date(Date.now() - 60 * 60_000).toISOString();
  const [perIp, global, total] = await Promise.all([
    supa.from("media").select("id", { count: "exact", head: true }).eq("ip_hash", ipHash).gte("created_at", since10),
    supa.from("media").select("id", { count: "exact", head: true }).gte("created_at", since60),
    supa.from("media").select("id", { count: "exact", head: true }).neq("status", "rejected"),
  ]);
  if (perIp.error || global.error || total.error) return err("Serverul este momentan indisponibil. Încearcă din nou.", 503);
  if ((perIp.count ?? 0) >= PER_IP_10MIN) return err("Ai atins limita temporară de încărcări. Revino peste câteva minute.", 429);
  if ((global.count ?? 0) >= GLOBAL_PER_HOUR || (total.count ?? 0) >= MAX_TOTAL_FILES)
    return err("Colecția este temporar plină. Anunță organizatorii.", 503);

  const day = new Date().toISOString().slice(0, 10);
  const path = `${day}/${randomUUID()}.${ext}`; // unique name, never overwrites

  const { data: signed, error: signErr } = await storage().createSignedUploadUrl(path);
  if (signErr || !signed) return err("Nu am putut pregăti încărcarea. Încearcă din nou.", 503);

  const { data: row, error: insErr } = await supa
    .from("media")
    .insert({ path, kind, mime, size, ip_hash: ipHash })
    .select("id")
    .single();
  if (insErr || !row) return err("Nu am putut pregăti încărcarea. Încearcă din nou.", 503);

  return NextResponse.json({ id: row.id, ticket: ticketFor(row.id), signedUrl: signed.signedUrl, mime });
}
