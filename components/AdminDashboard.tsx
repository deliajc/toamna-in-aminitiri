"use client";

import { useCallback, useEffect, useState } from "react";
import QRCode from "qrcode";
import { formatBytes } from "@/lib/config";

type MediaItem = {
  id: string;
  kind: "image" | "video";
  mime: string;
  size: number;
  createdAt: string;
  name: string;
  url: string;
  downloadUrl: string;
};
type Stats = { images: number; videos: number; bytes: number };
type Filter = "all" | "image" | "video";

const BATCH_MAX_BYTES = 400 * 1024 * 1024;
const BATCH_MAX_FILES = 80;

const fmtDate = (s: string) =>
  new Date(s).toLocaleString("ro-RO", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

function triggerDownload(href: string, name?: string) {
  const a = document.createElement("a");
  a.href = href;
  if (name) a.download = name;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export default function AdminDashboard({ siteUrl }: { siteUrl: string }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [items, setItems] = useState<MediaItem[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const [panel, setPanel] = useState<"export" | "qr" | null>(null);

  const load = useCallback(async (f: Filter, p: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/media?type=${f}&page=${p}`, { cache: "no-store" });
      if (res.status === 401) return window.location.reload();
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setStats(data.stats);
      setItems((prev) => (p === 0 ? data.items : [...prev, ...data.items]));
      setHasMore(data.hasMore);
      setPage(p);
    } catch (e) {
      setError((e as Error).message || "Nu am putut încărca galeria.");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load(filter, 0);
  }, [filter, load]);

  const remove = async (item: MediaItem) => {
    if (!confirm("Ștergi definitiv acest fișier? Acțiunea nu poate fi anulată.")) return;
    const res = await fetch(`/api/admin/media?id=${item.id}`, { method: "DELETE" });
    if (!res.ok) return alert((await res.json().catch(() => ({}))).error || "Ștergerea a eșuat.");
    setItems((list) => list.filter((i) => i.id !== item.id));
    setStats((s) =>
      s
        ? {
            images: s.images - (item.kind === "image" ? 1 : 0),
            videos: s.videos - (item.kind === "video" ? 1 : 0),
            bytes: s.bytes - item.size,
          }
        : s
    );
    setOpen((o) => (o === null ? null : items.length <= 1 ? null : Math.min(o, items.length - 2)));
  };

  const logout = async () => {
    await fetch("/api/admin/logout", { method: "POST" });
    window.location.reload();
  };

  /* keyboard navigation in the viewer */
  useEffect(() => {
    if (open === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(null);
      if (e.key === "ArrowRight") setOpen((o) => (o !== null && o < items.length - 1 ? o + 1 : o));
      if (e.key === "ArrowLeft") setOpen((o) => (o !== null && o > 0 ? o - 1 : o));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, items.length]);

  const current = open !== null ? items[open] : null;

  return (
    <div className="adm">
      <header className="adm-top">
        <div>
          <p className="adm-kicker">Administrare</p>
          <h1>Toamna în amintiri</h1>
        </div>
        <div className="adm-actions">
          <button className="adm-btn" onClick={() => setPanel(panel === "qr" ? null : "qr")}>
            Cod QR
          </button>
          <button className="adm-btn primary" onClick={() => setPanel(panel === "export" ? null : "export")}>
            Descarcă tot
          </button>
          <button className="adm-btn ghost" onClick={logout}>
            Ieșire
          </button>
        </div>
      </header>

      <section className="adm-stats">
        <div>
          <span>Fotografii</span>
          <strong>{stats?.images ?? "—"}</strong>
        </div>
        <div>
          <span>Videoclipuri</span>
          <strong>{stats?.videos ?? "—"}</strong>
        </div>
        <div>
          <span>Total fișiere</span>
          <strong>{stats ? stats.images + stats.videos : "—"}</strong>
        </div>
        <div>
          <span>Spațiu folosit</span>
          <strong>{stats ? formatBytes(stats.bytes) : "—"}</strong>
        </div>
      </section>

      {panel === "export" && <ExportPanel filter={filter} onClose={() => setPanel(null)} />}
      {panel === "qr" && <QrPanel defaultUrl={siteUrl} onClose={() => setPanel(null)} />}

      <nav className="adm-tabs" aria-label="Filtre">
        {(
          [
            ["all", "Toate"],
            ["image", "Fotografii"],
            ["video", "Videoclipuri"],
          ] as [Filter, string][]
        ).map(([k, label]) => (
          <button key={k} className={filter === k ? "on" : ""} onClick={() => setFilter(k)}>
            {label}
          </button>
        ))}
        <button className="adm-refresh" onClick={() => load(filter, 0)} disabled={loading}>
          Actualizează
        </button>
      </nav>

      {error && <p className="adm-error">{error}</p>}

      {!loading && !error && items.length === 0 && (
        <div className="adm-empty">
          <p>Încă nu a fost trimis niciun fișier.</p>
        </div>
      )}

      <ul className="adm-grid">
        {items.map((it, i) => (
          <li key={it.id}>
            <button className="adm-tile" onClick={() => setOpen(i)}>
              {it.kind === "image" ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={it.url} alt="" loading="lazy" />
              ) : (
                <video src={`${it.url}#t=0.5`} preload="metadata" muted playsInline />
              )}
              {it.kind === "video" && <span className="adm-badge">Video</span>}
              <span className="adm-meta">
                {fmtDate(it.createdAt)} · {formatBytes(it.size)}
              </span>
            </button>
          </li>
        ))}
      </ul>

      {hasMore && (
        <div className="adm-more">
          <button className="adm-btn" onClick={() => load(filter, page + 1)} disabled={loading}>
            {loading ? "Se încarcă…" : "Încarcă mai multe"}
          </button>
        </div>
      )}
      {loading && items.length === 0 && <p className="adm-loading">Se încarcă galeria…</p>}

      {current && (
        <div className="adm-viewer" role="dialog" aria-modal="true" onClick={() => setOpen(null)}>
          <div className="adm-viewer-inner" onClick={(e) => e.stopPropagation()}>
            <div className="adm-viewer-media">
              {current.kind === "image" ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={current.url} alt="" />
              ) : (
                <video key={current.id} src={current.url} controls autoPlay playsInline />
              )}
              {current.mime.includes("heic") || current.mime.includes("heif") ? (
                <p className="adm-note">Formatul HEIC poate să nu se afișeze în acest browser; descarcă fișierul pentru a-l vedea.</p>
              ) : null}
            </div>
            <div className="adm-viewer-bar">
              <span>
                {fmtDate(current.createdAt)} · {formatBytes(current.size)} · {current.mime}
              </span>
              <div className="adm-actions">
                <button className="adm-btn" disabled={open === 0} onClick={() => setOpen((o) => (o ? o - 1 : o))}>
                  ←
                </button>
                <button
                  className="adm-btn"
                  disabled={open === items.length - 1}
                  onClick={() => setOpen((o) => (o !== null ? o + 1 : o))}
                >
                  →
                </button>
                <button className="adm-btn primary" onClick={() => triggerDownload(current.downloadUrl)}>
                  Descarcă
                </button>
                <button className="adm-btn danger" onClick={() => remove(current)}>
                  Șterge
                </button>
                <button className="adm-btn ghost" onClick={() => setOpen(null)}>
                  Închide
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------- export in batches ---------------- */

function ExportPanel({ filter, onClose }: { filter: Filter; onClose: () => void }) {
  const [batches, setBatches] = useState<MediaItem[][] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<Record<number, string>>({});

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/admin/media?type=${filter}&all=1`, { cache: "no-store" });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        const out: MediaItem[][] = [];
        let cur: MediaItem[] = [];
        let bytes = 0;
        for (const it of (data.items as MediaItem[]).slice().reverse()) {
          if (cur.length && (bytes + it.size > BATCH_MAX_BYTES || cur.length >= BATCH_MAX_FILES)) {
            out.push(cur);
            cur = [];
            bytes = 0;
          }
          cur.push(it);
          bytes += it.size;
        }
        if (cur.length) out.push(cur);
        setBatches(out);
      } catch (e) {
        setError((e as Error).message || "Nu am putut pregăti exportul.");
      }
    })();
  }, [filter]);

  const downloadBatch = async (idx: number, batch: MediaItem[]) => {
    const { downloadZip } = await import("client-zip");
    let done = 0;
    setProgress((p) => ({ ...p, [idx]: `0 / ${batch.length}` }));
    try {
      async function* files() {
        for (const it of batch) {
          const res = await fetch(it.url);
          if (!res.ok) throw new Error("Un fișier nu a putut fi descărcat.");
          yield { name: it.name, lastModified: new Date(it.createdAt), input: res };
          done++;
          setProgress((p) => ({ ...p, [idx]: `${done} / ${batch.length}` }));
        }
      }
      const blob = await downloadZip(files()).blob();
      const href = URL.createObjectURL(blob);
      triggerDownload(href, `toamna-in-amintiri-lot-${String(idx + 1).padStart(2, "0")}.zip`);
      setTimeout(() => URL.revokeObjectURL(href), 60_000);
      setProgress((p) => ({ ...p, [idx]: "Descărcat ✓" }));
    } catch (e) {
      setProgress((p) => ({ ...p, [idx]: `Eroare: ${(e as Error).message}` }));
    }
  };

  return (
    <section className="adm-panel">
      <div className="adm-panel-head">
        <h2>Descarcă pe loturi</h2>
        <button className="adm-btn ghost" onClick={onClose}>
          Închide
        </button>
      </div>
      <p className="adm-muted">
        Fișierele sunt grupate în arhive ZIP de cel mult {formatBytes(BATCH_MAX_BYTES)}, ca descărcarea să rămână
        stabilă. Pentru arhiva completă dintr-o singură comandă, vezi scriptul <code>npm run export</code> din README.
      </p>
      {error && <p className="adm-error">{error}</p>}
      {!batches && !error && <p className="adm-loading">Se pregătește lista…</p>}
      {batches?.length === 0 && <p className="adm-muted">Nu există fișiere de descărcat.</p>}
      <ul className="adm-batches">
        {batches?.map((b, i) => (
          <li key={i}>
            <div>
              <strong>Lotul {i + 1}</strong>
              <span>
                {b.length} fișiere · {formatBytes(b.reduce((s, x) => s + x.size, 0))} · {fmtDate(b[0].createdAt)} –{" "}
                {fmtDate(b[b.length - 1].createdAt)}
              </span>
            </div>
            <div className="adm-batch-right">
              {progress[i] && <span className="adm-muted">{progress[i]}</span>}
              <button
                className="adm-btn"
                disabled={!!progress[i] && /\d+ \/ \d+/.test(progress[i])}
                onClick={() => downloadBatch(i, b)}
              >
                Descarcă ZIP
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ---------------- QR code ---------------- */

function QrPanel({ defaultUrl, onClose }: { defaultUrl: string; onClose: () => void }) {
  const [url, setUrl] = useState(defaultUrl);
  const [svg, setSvg] = useState("");

  useEffect(() => {
    if (!url) setUrl(window.location.origin);
  }, [url]);

  useEffect(() => {
    if (!url) return;
    QRCode.toString(url, { type: "svg", errorCorrectionLevel: "H", margin: 2, color: { dark: "#481827", light: "#FFFFFF" } })
      .then(setSvg)
      .catch(() => setSvg(""));
  }, [url]);

  const downloadPng = async () => {
    const data = await QRCode.toDataURL(url, {
      errorCorrectionLevel: "H",
      margin: 2,
      width: 2400,
      color: { dark: "#481827", light: "#FFFFFF" },
    });
    triggerDownload(data, "cod-qr-toamna-in-amintiri.png");
  };

  const downloadSvg = () => {
    const href = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
    triggerDownload(href, "cod-qr-toamna-in-amintiri.svg");
    setTimeout(() => URL.revokeObjectURL(href), 10_000);
  };

  return (
    <section className="adm-panel adm-qr">
      <div className="adm-panel-head">
        <h2>Cod QR pentru eveniment</h2>
        <button className="adm-btn ghost" onClick={onClose}>
          Închide
        </button>
      </div>
      <div className="adm-qr-body">
        <div className="adm-qr-code" dangerouslySetInnerHTML={{ __html: svg }} />
        <div className="adm-qr-side">
          <label htmlFor="qr-url">Adresa paginii de încărcare</label>
          <input id="qr-url" value={url} onChange={(e) => setUrl(e.target.value.trim())} spellCheck={false} />
          <p className="adm-muted">
            Verifică adresa înainte de tipărire: scanează codul cu un iPhone și cu un telefon Android. Nu schimba adresa
            site-ului după ce codul a fost tipărit.
          </p>
          <div className="adm-actions">
            <button className="adm-btn primary" onClick={downloadPng} disabled={!url}>
              PNG (2400 px)
            </button>
            <button className="adm-btn" onClick={downloadSvg} disabled={!svg}>
              SVG (vectorial)
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
