import type { Metadata } from "next";
import { isAdmin } from "@/lib/server";
import AdminLogin from "@/components/AdminLogin";
import AdminDashboard from "@/components/AdminDashboard";
import "./admin.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Administrare · Toamna în amintiri",
  robots: { index: false, follow: false, nocache: true },
};

export default async function AdminPage() {
  const ok = await isAdmin();
  return ok ? <AdminDashboard siteUrl={process.env.NEXT_PUBLIC_SITE_URL || ""} /> : <AdminLogin />;
}
