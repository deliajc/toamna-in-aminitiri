import { NextResponse } from "next/server";
import { destroySession } from "@/lib/server";

export async function POST() {
  await destroySession();
  return NextResponse.json({ ok: true });
}
