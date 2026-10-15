import { NextResponse } from "next/server";
import { burstLimit, checkPassword, clientIp, createSession, hashIp } from "@/lib/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const key = "login:" + hashIp(await clientIp());
  if (!burstLimit(key, 8, 15 * 60_000))
    return NextResponse.json({ error: "Prea multe încercări. Revino peste 15 minute." }, { status: 429 });

  let password = "";
  try {
    password = String((await req.json()).password || "");
  } catch {}

  await new Promise((r) => setTimeout(r, 400)); // slows down guessing
  if (!checkPassword(password)) return NextResponse.json({ error: "Parolă incorectă." }, { status: 401 });

  await createSession();
  return NextResponse.json({ ok: true });
}
