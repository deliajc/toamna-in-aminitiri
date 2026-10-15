# Toamna în amintiri

Site pentru colectarea fotografiilor și videoclipurilor de la evenimentul școlii. Elevii scanează codul QR, aleg fișierele și apasă „Trimite amintirile". Fără cont, fără e-mail, fără formulare.

- **Pagina principală** (`/`) — încărcare directă, mai multe fișiere deodată, previzualizări, progres real, reîncercare automată și manuală.
- **Administrare** (`/admin`) — protejată cu parolă: galerie, filtre foto/video, previzualizare, descărcare individuală, export ZIP pe loturi, ștergere, statistici, generator de cod QR.
- **Stocare** — Supabase Storage, bucket **privat**. Fișierele ajung direct din telefon în stocare prin linkuri semnate, valabile pentru un singur fișier; cheia secretă nu ajunge niciodată în browser.

---

## Publicare pas cu pas (aprox. 20 de minute)

Ai nevoie de trei conturi gratuite: **Supabase** (stocarea), **GitHub** (codul) și **Vercel** (găzduirea).

### 1. Supabase — stocarea

1. Intră pe [supabase.com](https://supabase.com) → **New project**. Alege regiunea **Central EU (Frankfurt)** și o parolă pentru baza de date (păstreaz-o).
2. În proiect: **SQL Editor → New query**, lipește tot conținutul fișierului `supabase/setup.sql` și apasă **Run**. Se creează bucket-ul privat `event-media` și tabelul `media`.
3. **Project Settings → API**: copiază **Project URL** și cheia **service_role** (sau o cheie „secret"). Le vei folosi la pasul 3.

> **Limita pentru videoclipuri.** Pe planul **Free**, Supabase acceptă cel mult **50 MB per fișier** — un videoclip de 1–2 minute filmat cu telefonul depășește ușor această limită. Ai două variante:
> - **Recomandat pentru eveniment:** treci proiectul pe planul **Pro** pe durata evenimentului, apoi în **Storage → Settings** setează „Upload file size limit" la 500 MB. Apoi setează în Vercel `NEXT_PUBLIC_MAX_VIDEO_MB=500`.
> - **Rămâi pe Free:** nu trebuie să faci nimic — limita implicită este 50 MB. Elevii vor vedea un mesaj clar dacă un videoclip e prea mare.
>
> Proiectele Free se suspendă după o săptămână fără activitate — deschide proiectul în ziua dinaintea evenimentului.

### 2. GitHub — codul

1. Creează un repository nou (poate fi privat), de exemplu `toamna-in-amintiri`.
2. **Add file → Upload files** și încarcă tot conținutul acestui folder (fără `node_modules`, dacă există).

### 3. Vercel — site-ul public

1. Pe [vercel.com](https://vercel.com) → **Add New → Project** → importă repository-ul.
2. Numele proiectului devine adresa: `toamna-in-amintiri` → `https://toamna-in-amintiri.vercel.app`.
3. La **Environment Variables** adaugă:

| Variabilă | Valoare |
|---|---|
| `SUPABASE_URL` | Project URL din Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | cheia service_role / secret |
| `ADMIN_PASSWORD` | parola organizatorilor (minimum 10 caractere, recomandat 16+) |
| `SESSION_SECRET` | un șir aleator de cel puțin 32 de caractere |
| `NEXT_PUBLIC_SITE_URL` | adresa finală, ex. `https://toamna-in-amintiri.vercel.app` |

Opționale (vezi `.env.example`): `NEXT_PUBLIC_MAX_VIDEO_MB`, `NEXT_PUBLIC_MAX_IMAGE_MB`, `NEXT_PUBLIC_REQUIRE_CONSENT=true` (casetă de acord obligatorie), `NEXT_PUBLIC_UPLOADS_CLOSED=true` (închide încărcările după eveniment).

4. **Deploy.** După 1–2 minute site-ul este online.

> Variabilele care încep cu `NEXT_PUBLIC_` se aplică la compilare: după ce le schimbi, apasă **Redeploy** în Vercel.

### 4. Test și cod QR

1. Deschide site-ul pe un iPhone și pe un Android, trimite câte o fotografie și un videoclip.
2. Intră pe `/admin`, autentifică-te și verifică că fișierele apar.
3. În `/admin` → **Cod QR**: descarcă **PNG (2400 px)** pentru tipărire sau **SVG** pentru grafician. Scanează codul tipărit de probă înainte de tirajul final.

**Nu redenumi proiectul Vercel și nu schimba domeniul după tipărirea codului.** Adresa rămâne stabilă cât timp proiectul există.

Alternativ, din linia de comandă: `npm run qr -- https://adresa-ta` creează `qr/cod-qr.png` și `qr/cod-qr.svg`.

### 5. După eveniment

- Setează `NEXT_PUBLIC_UPLOADS_CLOSED=true` și fă Redeploy — pagina va afișa „Încărcările pentru acest eveniment s-au încheiat."
- Descarcă tot din `/admin → Descarcă tot` (arhive ZIP de maximum 400 MB fiecare), sau, pentru o arhivă completă pe calculator:

```bash
npm install
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npm run export
```

Fișierele ajung în `export/fotografii` și `export/videoclipuri`; scriptul poate fi reluat dacă se întrerupe.

---

## Securitate și protecție împotriva abuzurilor

- Bucket privat, fără nicio politică publică; tabelul `media` are RLS activat fără politici (inaccesibil cu chei publice).
- Serverul verifică tipul și mărimea înainte de a emite linkul de încărcare; Supabase impune separat tipurile MIME și limita de mărime la nivel de bucket.
- După încărcare, serverul citește primii octeți ai fișierului și **șterge** orice nu este o imagine sau un videoclip real (ex. un fișier text redenumit în `.jpg`).
- Nume unice (`AAAA-LL-ZZ/<uuid>.ext`) — nimic nu poate fi suprascris.
- Limite: cereri în rafală per dispozitiv, 400 de fișiere / 10 minute per adresă IP (generos, pentru că elevii pot folosi aceeași rețea Wi-Fi), 6000 de fișiere / oră global, 20 000 în total. Toate se pot ajusta din variabile.
- Adresele IP nu sunt salvate, doar o amprentă criptografică a lor, folosită pentru limite.
- `/admin`: parolă verificată în timp constant, maximum 8 încercări / 15 minute, sesiune semnată (cookie HttpOnly, SameSite=Strict, 12 ore), `noindex`.
- Antete de securitate: CSP, HSTS, `frame-ancestors 'none'`, `nosniff`. Site-ul nu este indexat de motoarele de căutare.

## Formate acceptate

Fotografii: JPG, PNG, HEIC/HEIF (iPhone), WebP, GIF — implicit până la 40 MB.
Video: MP4, MOV (iPhone), WebM, 3GP, M4V — implicit până la 50 MB (planul Free).
Maximum 30 de fișiere per trimitere; elevii pot trimite de mai multe ori.

## Dezvoltare locală

```bash
npm install
cp .env.example .env.local   # completează valorile
npm run dev                  # http://localhost:3000
```

Tehnologii: Next.js 15, React 19, Supabase JS, fonturi Fraunces și Manrope găzduite local (fără dependență de Google Fonts).
