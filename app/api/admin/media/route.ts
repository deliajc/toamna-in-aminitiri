import { NextResponse } from "next/server";
import { db, isAdmin, storage, verifyUpload, type MediaRow } from "@/lib/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PAGE = 48;
const URL_TTL = 60 * 60 * 3; // 3 h

const unauthorized = () => NextResponse.json({ error: "Neautorizat." }, { status: 401 });

function downloadName(row: MediaRow) {
  const d = new Date(row.created_at);
  const stamp = d.toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);
  const ext = row.path.split(".").pop();
  return `toamna-${row.kind === "image" ? "foto" : "video"}-${stamp}-${row.id.slice(0, 6)}.${ext}`;
}

/** Confirms uploads whose browser never reported back (e.g. lost connection). */
async function reconcilePending() {
  const cutoff = new Date(Date.now() - 15 * 60_000).toISOString();
  const { data } = await db()
    .from("media")
    .select("id,path,kind,mime,size,status,created_at")
    .eq("status", "pending")
    .lt("created_at", cutoff)
    .limit(20);
  for (const row of (data || []) as MediaRow[]) {
    const s = await verifyUpload(row);
    // Never uploaded and older than a day: drop the placeholder.
    if (s === "missing" && Date.now() - +new Date(row.created_at) > 86_400_000)
      await db().from("media").delete().eq("id", row.id);
  }
}

export async function GET(req: Request) {
  if (!(await isAdmin())) return unauthorized();
  const url = new URL(req.url);
  const type = url.searchParams.get("type");
  const all = url.searchParams.get("all") === "1";
  const page = Math.max(0, Number(url.searchParams.get("page") || 0));

  await reconcilePending().catch(() => {});

  // Stats (ready files only)
  const { data: statRows, error: statErr } = await db()
    .from("media")
    .select("kind,size")
    .eq("status", "ready")
    .limit(100000);
  if (statErr) return NextResponse.json({ error: "Baza de date nu răspunde." }, { status: 503 });
  const stats = { images: 0, videos: 0, bytes: 0 };
  for (const r of statRows || []) {
    if (r.kind === "image") stats.images++;
    else stats.videos++;
    stats.bytes += Number(r.size) || 0;
  }

  let q = db()
    .from("media")
    .select("id,path,kind,mime,size,status,created_at")
    .eq("status", "ready")
    .order("created_at", { ascending: false });
  if (type === "image" || type === "video") q = q.eq("kind", type);
  q = all ? q.limit(100000) : q.range(page * PAGE, page * PAGE + PAGE);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: "Baza de date nu răspunde." }, { status: 503 });
  const rows = (data || []) as MediaRow[];
  const hasMore = !all && rows.length > PAGE;
  const slice = all ? rows : rows.slice(0, PAGE);

  // Signed, time-limited links — the bucket itself stays private.
  const paths = slice.map((r) => r.path);
  const viewMap = new Map<string, string>();
  for (let i = 0; i < paths.length; i += 500) {
    const { data: signed } = await storage().createSignedUrls(paths.slice(i, i + 500), URL_TTL);
    for (const s of signed || []) if (s.path && s.signedUrl) viewMap.set(s.path, s.signedUrl);
  }

  const items = slice.map((r) => {
    const view = viewMap.get(r.path) || "";
    const name = downloadName(r);
    return {
      id: r.id,
      kind: r.kind,
      mime: r.mime,
      size: Number(r.size),
      createdAt: r.created_at,
      name,
      url: view,
      downloadUrl: view ? `${view}&download=${encodeURIComponent(name)}` : "",
    };
  });

  return NextResponse.json({ stats, items, hasMore });
}

export async function DELETE(req: Request) {
  if (!(await isAdmin())) return unauthorized();
  const id = new URL(req.url).searchParams.get("id") || "";
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Cerere invalidă." }, { status: 400 });

  const { data: row } = await db().from("media").select("path").eq("id", id).maybeSingle();
  if (!row) return NextResponse.json({ error: "Fișierul nu există." }, { status: 404 });

  const { error: rmErr } = await storage().remove([row.path]);
  if (rmErr) return NextResponse.json({ error: "Nu am putut șterge fișierul." }, { status: 503 });
  await db().from("media").delete().eq("id", id);
  return NextResponse.json({ ok: true });
}
