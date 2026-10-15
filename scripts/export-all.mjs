// Descarcă TOATE fișierele confirmate în folderul ./export (rulează pe calculatorul organizatorului).
// Folosire: SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npm run export
import { createClient } from "@supabase/supabase-js";
import { mkdirSync, existsSync, createWriteStream } from "fs";
import { Readable } from "stream";
import { pipeline } from "stream/promises";

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Setează SUPABASE_URL și SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}
const supa = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const rows = [];
for (let from = 0; ; from += 1000) {
  const { data, error } = await supa
    .from("media")
    .select("id,path,kind,created_at")
    .eq("status", "ready")
    .order("created_at")
    .range(from, from + 999);
  if (error) throw error;
  rows.push(...data);
  if (data.length < 1000) break;
}

console.log(`${rows.length} fișiere de descărcat.`);
for (const dir of ["export/fotografii", "export/videoclipuri"]) mkdirSync(dir, { recursive: true });

let n = 0;
for (const r of rows) {
  n++;
  const stamp = r.created_at.replace(/[-:]/g, "").replace("T", "-").slice(0, 15);
  const ext = r.path.split(".").pop();
  const file = `export/${r.kind === "image" ? "fotografii" : "videoclipuri"}/${stamp}-${r.id.slice(0, 6)}.${ext}`;
  if (existsSync(file)) continue; // reluabil
  const { data: signed, error } = await supa.storage.from("event-media").createSignedUrl(r.path, 600);
  if (error) {
    console.warn(`  omis ${r.path}: ${error.message}`);
    continue;
  }
  const res = await fetch(signed.signedUrl);
  if (!res.ok || !res.body) {
    console.warn(`  omis ${r.path}: HTTP ${res.status}`);
    continue;
  }
  await pipeline(Readable.fromWeb(res.body), createWriteStream(file));
  console.log(`  [${n}/${rows.length}] ${file}`);
}
console.log("Export finalizat în ./export");
