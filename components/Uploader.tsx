"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ALLOWED,
  MAX_FILES_PER_SUBMISSION,
  REQUIRE_CONSENT,
  UPLOADS_CLOSED,
  formatBytes,
  maxBytesFor,
  resolveMime,
  type Kind,
} from "@/lib/config";

type Status = "ready" | "uploading" | "done" | "error";

type Item = {
  id: string;
  file: File;
  mime: string;
  kind: Kind;
  preview: string;
  status: Status;
  loaded: number;
  error?: string;
  retryable?: boolean;
  previewFailed?: boolean;
};

class UploadError extends Error {
  constructor(message: string, public retryable: boolean) {
    super(message);
  }
}

const CONCURRENCY = 3;
const NETWORK_MSG = "Conexiunea s-a întrerupt.";

/* ---------------- transport ---------------- */

async function postJson(url: string, body: unknown) {
  let res: Response;
  try {
    res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  } catch {
    throw new UploadError(NETWORK_MSG, true);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new UploadError(data.error || "A apărut o eroare.", res.status >= 500 || res.status === 429);
  return data;
}

function putFile(url: string, file: File, mime: string, onProgress: (loaded: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("content-type", mime);
    xhr.setRequestHeader("x-upsert", "false");
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded);
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) return resolve();
      const tooBig = xhr.status === 413 || /size|large/i.test(xhr.responseText);
      reject(
        new UploadError(
          tooBig ? "Fișierul este prea mare pentru server." : "Serverul a refuzat fișierul.",
          !tooBig && (xhr.status >= 500 || xhr.status === 429 || xhr.status === 0)
        )
      );
    };
    xhr.onerror = () => reject(new UploadError(NETWORK_MSG, true));
    xhr.ontimeout = () => reject(new UploadError(NETWORK_MSG, true));
    xhr.send(file);
  });
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function uploadWithRetry(item: Item, onProgress: (n: number) => void) {
  let attempt = 0;
  for (;;) {
    try {
      const signed = await postJson("/api/upload/sign", { name: item.file.name, type: item.mime, size: item.file.size });
      onProgress(0);
      await putFile(signed.signedUrl, item.file, signed.mime, onProgress);
      // Confirmation is cheap; retry it on its own so a big video is not re-sent.
      for (let c = 0; ; c++) {
        try {
          await postJson("/api/upload/complete", { id: signed.id, ticket: signed.ticket });
          return;
        } catch (e) {
          if (!(e instanceof UploadError) || !e.retryable || c >= 3) throw e;
          await wait(1500 * (c + 1));
        }
      }
    } catch (e) {
      const err = e instanceof UploadError ? e : new UploadError("A apărut o eroare.", true);
      if (!err.retryable || attempt >= 2) throw err;
      attempt++;
      await wait(2000 * attempt);
    }
  }
}

/* ---------------- icons ---------------- */

const Icon = {
  plus: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 5v14M5 12h14" />
    </svg>
  ),
  camera: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 8.5A2.5 2.5 0 0 1 6.5 6h1.3l1.2-1.6A1 1 0 0 1 9.8 4h4.4a1 1 0 0 1 .8.4L16.2 6h1.3A2.5 2.5 0 0 1 20 8.5v8a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 16.5z" />
      <circle cx="12" cy="12.5" r="3.4" />
    </svg>
  ),
  x: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7 7l10 10M17 7 7 17" />
    </svg>
  ),
  retry: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 12a8 8 0 0 1 14-5.3L20 9M20 4v5h-5M20 12a8 8 0 0 1-14 5.3L4 15M4 20v-5h5" />
    </svg>
  ),
  check: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 12.5 10 17l9-10" />
    </svg>
  ),
  play: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8 5.5v13l10.5-6.5z" />
    </svg>
  ),
  image: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3.5" y="4.5" width="17" height="15" rx="3" />
      <circle cx="9" cy="10" r="1.8" />
      <path d="m4.5 17.5 5-5 4 4 2.5-2.5 4 4" />
    </svg>
  ),
};

/* ---------------- component ---------------- */

export default function Uploader() {
  const [items, setItems] = useState<Item[]>([]);
  const [phase, setPhase] = useState<"pick" | "review" | "sending" | "result">("pick");
  const [notice, setNotice] = useState<string | null>(null);
  const [consent, setConsent] = useState(false);
  const [dragging, setDragging] = useState(false);
  const libraryRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const cardRef = useRef<HTMLElement>(null);
  const itemsRef = useRef(items);
  itemsRef.current = items;

  const update = (id: string, patch: Partial<Item>) =>
    setItems((list) => list.map((it) => (it.id === id ? { ...it, ...patch } : it)));

  /* adding files */
  const addFiles = useCallback((fileList: FileList | File[] | null) => {
    if (!fileList) return;
    const files = Array.from(fileList);
    const current = itemsRef.current.filter((i) => i.status !== "done");
    const room = MAX_FILES_PER_SUBMISSION - current.length;
    let unsupported = 0;
    let tooBig = 0;
    let overflow = 0;
    const fresh: Item[] = [];
    for (const file of files) {
      const mime = resolveMime(file.name, file.type);
      if (!mime) {
        unsupported++;
        continue;
      }
      const kind = ALLOWED[mime][0];
      if (file.size > maxBytesFor(kind)) {
        tooBig++;
        continue;
      }
      if (fresh.length >= room) {
        overflow++;
        continue;
      }
      fresh.push({
        id: crypto.randomUUID(),
        file,
        mime,
        kind,
        preview: URL.createObjectURL(file),
        status: "ready",
        loaded: 0,
      });
    }
    const parts: string[] = [];
    if (unsupported) parts.push(`${unsupported} ${unsupported === 1 ? "fișier are" : "fișiere au"} un format neacceptat`);
    if (tooBig) parts.push(`${tooBig} ${tooBig === 1 ? "fișier depășește" : "fișiere depășesc"} limita de mărime`);
    if (overflow) parts.push(`poți trimite cel mult ${MAX_FILES_PER_SUBMISSION} fișiere odată`);
    setNotice(parts.length ? `Atenție: ${parts.join("; ")}.` : null);
    if (fresh.length) {
      setItems((list) => [...list.filter((i) => i.status !== "done"), ...fresh]);
      setPhase("review");
    }
  }, []);

  const remove = (id: string) =>
    setItems((list) => {
      const it = list.find((i) => i.id === id);
      if (it) URL.revokeObjectURL(it.preview);
      const next = list.filter((i) => i.id !== id);
      if (!next.length) setPhase("pick");
      return next;
    });

  const reset = () => {
    itemsRef.current.forEach((i) => URL.revokeObjectURL(i.preview));
    setItems([]);
    setNotice(null);
    setPhase("pick");
  };

  /* keep the whole card (and its main button) on screen after each step */
  useEffect(() => {
    if (phase !== "pick") cardRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [phase]);

  /* drag & drop (desktop) — the whole page is a drop target */
  useEffect(() => {
    let depth = 0;
    const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types || []).includes("Files");
    const enter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth++;
      setDragging(true);
    };
    const over = (e: DragEvent) => hasFiles(e) && e.preventDefault();
    const leave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth = Math.max(0, depth - 1);
      if (!depth) setDragging(false);
    };
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      setDragging(false);
      if (phase !== "sending") addFiles(e.dataTransfer?.files || null);
    };
    window.addEventListener("dragenter", enter);
    window.addEventListener("dragover", over);
    window.addEventListener("dragleave", leave);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragenter", enter);
      window.removeEventListener("dragover", over);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("drop", drop);
    };
  }, [addFiles, phase]);

  /* keep the phone awake + warn before leaving while sending */
  useEffect(() => {
    if (phase !== "sending") return;
    let lock: { release: () => Promise<void> } | null = null;
    const nav = navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } };
    nav.wakeLock?.request("screen").then((l) => (lock = l)).catch(() => {});
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => {
      window.removeEventListener("beforeunload", warn);
      lock?.release().catch(() => {});
    };
  }, [phase]);

  /* sending */
  const send = async (onlyFailed = false) => {
    const queue = itemsRef.current.filter((i) =>
      onlyFailed ? i.status === "error" && i.retryable : i.status === "ready" || (i.status === "error" && i.retryable)
    );
    if (!queue.length) return;
    setNotice(null);
    setPhase("sending");
    queue.forEach((q) => update(q.id, { status: "uploading", loaded: 0, error: undefined }));

    let cursor = 0;
    const worker = async () => {
      while (cursor < queue.length) {
        const item = queue[cursor++];
        try {
          await uploadWithRetry(item, (loaded) => update(item.id, { loaded }));
          update(item.id, { status: "done", loaded: item.file.size });
        } catch (e) {
          const err = e as UploadError;
          update(item.id, { status: "error", error: err.message, retryable: err.retryable, loaded: 0 });
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, worker));
    setPhase("result");
  };

  /* derived */
  const total = items.reduce((s, i) => s + i.file.size, 0);
  const loaded = items.reduce((s, i) => s + (i.status === "done" ? i.file.size : i.loaded), 0);
  const pct = total ? Math.min(100, Math.round((loaded / total) * 100)) : 0;
  const doneCount = items.filter((i) => i.status === "done").length;
  const failed = items.filter((i) => i.status === "error");
  const retryable = failed.filter((i) => i.retryable);
  const allDone = phase === "result" && items.length > 0 && failed.length === 0;
  const canSend = items.some((i) => i.status === "ready") && (!REQUIRE_CONSENT || consent);

  const pickerInputs = (
    <>
      <input
        ref={libraryRef}
        type="file"
        accept="image/*,video/*,.heic,.heif,.mov"
        multiple
        hidden
        onChange={(e) => {
          addFiles(e.target.files);
          e.target.value = "";
        }}
      />
      <input
        ref={cameraRef}
        type="file"
        accept="image/*,video/*"
        capture="environment"
        hidden
        onChange={(e) => {
          addFiles(e.target.files);
          e.target.value = "";
        }}
      />
    </>
  );

  if (UPLOADS_CLOSED) {
    return (
      <section className="card">
        <div className="card-body center">
          <p className="card-kicker">Mulțumim!</p>
          <p className="closed">Încărcările pentru acest eveniment s-au încheiat.</p>
        </div>
      </section>
    );
  }

  return (
    <section ref={cardRef} className={`card ${dragging ? "is-dragging" : ""}`} aria-live="polite">
      {pickerInputs}
      <svg className="card-leaf" viewBox="0 0 100 100" aria-hidden="true">
        <path d="M50 2C78 22 92 52 76 80c-8 14-18 18-26 18S32 94 24 80C8 52 22 22 50 2Z" />
        <path d="M50 10v86M50 40 66 28M50 56l-18-12M50 72l16-12" />
      </svg>

      {allDone ? (
        <div className="card-body success" key="success">
          <div className="success-mark">{Icon.check}</div>
          <h2 className="success-title">Amintirile tale au ajuns la noi!</h2>
          <p className="success-text">Mulțumim că faci parte din poveste.</p>
          <p className="success-count">
            {doneCount} {doneCount === 1 ? "fișier trimis" : "fișiere trimise"}
          </p>
          <button className="btn btn-cream" onClick={reset}>
            {Icon.plus}
            Mai trimite amintiri
          </button>
          <div className="confetti" aria-hidden="true">
            {Array.from({ length: 9 }, (_, i) => (
              <span key={i} style={{ "--i": i } as React.CSSProperties} />
            ))}
          </div>
        </div>
      ) : phase === "pick" ? (
        <div className="card-body pick" key="pick">
          <div className="pick-art" aria-hidden="true">
            <span className="frame f1" />
            <span className="frame f2" />
            <span className="frame f3">{Icon.image}</span>
          </div>
          <button className="btn btn-cream btn-xl" onClick={() => libraryRef.current?.click()}>
            {Icon.plus}
            Adaugă fotografii și video
          </button>
          <button className="btn-ghost" onClick={() => cameraRef.current?.click()}>
            {Icon.camera}
            Fă o fotografie sau filmează acum
          </button>
          <p className="hint">
            <span className="desktop-only">Sau trage fișierele oriunde pe pagină. </span>
            Poți alege mai multe deodată.
          </p>
          {notice && <p className="notice">{notice}</p>}
        </div>
      ) : (
        <div className="card-body review" key="review">
          <div className="review-head">
            <p className="card-kicker">
              {phase === "sending"
                ? `Se trimit amintirile… ${pct}%`
                : phase === "result"
                ? `${doneCount} din ${items.length} trimise`
                : `${items.length} ${items.length === 1 ? "amintire aleasă" : "amintiri alese"}`}
            </p>
            <p className="review-size">{formatBytes(total)}</p>
          </div>

          {phase !== "review" && (
            <div className="bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
              <span style={{ width: `${pct}%` }} />
            </div>
          )}

          <ul className="thumbs">
            {items.map((it) => {
              const p = it.status === "done" ? 100 : Math.round((it.loaded / it.file.size) * 100);
              return (
                <li key={it.id} className={`thumb is-${it.status}`}>
                  {it.kind === "image" && !it.previewFailed ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={it.preview} alt="" onError={() => update(it.id, { previewFailed: true })} />
                  ) : it.kind === "video" ? (
                    <video src={`${it.preview}#t=0.1`} muted playsInline preload="metadata" />
                  ) : (
                    <div className="thumb-fallback">
                      {Icon.image}
                      <span>{it.file.name.split(".").pop()?.toUpperCase()}</span>
                    </div>
                  )}
                  {it.kind === "video" && <span className="badge">{Icon.play}Video</span>}

                  {it.status === "uploading" && (
                    <div className="thumb-overlay">
                      <svg className="ring" viewBox="0 0 36 36">
                        <circle cx="18" cy="18" r="15" className="ring-bg" />
                        <circle cx="18" cy="18" r="15" className="ring-fg" style={{ strokeDashoffset: 94.25 * (1 - p / 100) }} />
                      </svg>
                    </div>
                  )}
                  {it.status === "done" && <div className="thumb-overlay ok">{Icon.check}</div>}
                  {it.status === "error" && (
                    <div className="thumb-overlay err" title={it.error}>
                      {it.retryable ? Icon.retry : Icon.x}
                      <span>{it.retryable ? "Eșuat" : "Respins"}</span>
                    </div>
                  )}

                  {(it.status === "ready" || (it.status === "error" && phase !== "sending")) && (
                    <button className="thumb-remove" onClick={() => remove(it.id)} aria-label="Elimină fișierul">
                      {Icon.x}
                    </button>
                  )}
                </li>
              );
            })}
            {phase === "review" && items.length < MAX_FILES_PER_SUBMISSION && (
              <li className="thumb add">
                <button onClick={() => libraryRef.current?.click()} aria-label="Adaugă mai multe">
                  {Icon.plus}
                  <span>Mai multe</span>
                </button>
              </li>
            )}
          </ul>

          {notice && <p className="notice">{notice}</p>}

          {phase === "review" && (
            <>
              {REQUIRE_CONSENT && (
                <label className="consent">
                  <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
                  <span>
                    Sunt de acord ca organizatorii să păstreze și să folosească aceste materiale pentru evenimentul școlii.
                  </span>
                </label>
              )}
              <button className="btn btn-gold btn-xl" disabled={!canSend} onClick={() => send()}>
                Trimite amintirile
              </button>
              <button className="btn-ghost small" onClick={reset}>
                Renunță
              </button>
            </>
          )}

          {phase === "sending" && (
            <p className="hint">Nu închide pagina până se termină. Videoclipurile mari pot dura puțin mai mult.</p>
          )}

          {phase === "result" && failed.length > 0 && (
            <div className="result-error">
              <p>
                {failed.length === 1 ? "Un fișier nu a putut fi trimis." : `${failed.length} fișiere nu au putut fi trimise.`}{" "}
                {failed[0]?.error}
                {retryable.length < failed.length && " Fișierele respinse nu pot fi trimise."}
              </p>
              {retryable.length > 0 && (
                <button className="btn btn-gold" onClick={() => send(true)}>
                  {Icon.retry}
                  Reîncearcă {retryable.length === 1 ? "fișierul" : `cele ${retryable.length} fișiere`}
                </button>
              )}
              <button className="btn-ghost small" onClick={reset}>
                {doneCount ? "Am terminat" : "Începe din nou"}
              </button>
            </div>
          )}
        </div>
      )}
      {dragging && <div className="drop-hint">Lasă fișierele aici</div>}
    </section>
  );
}
