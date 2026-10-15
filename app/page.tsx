import Leaves from "@/components/Leaves";
import Uploader from "@/components/Uploader";

export default function Home() {
  return (
    <main className="home">
      <Leaves />
      <div className="home-grid">
        <header className="intro">
          <p className="eyebrow">
            <span className="dot" /> Colecția evenimentului
          </p>
          <h1 className="title">
            <span className="line">Toamna</span>
            <span className="line accent">în amintiri.</span>
          </h1>
          <p className="lede">
            Momentele frumoase merită păstrate. Încarcă fotografiile și videoclipurile tale de la eveniment și
            contribuie la povestea noastră.
          </p>
        </header>

        <Uploader />

        <footer className="privacy">
          <details>
            <summary>Confidențialitate</summary>
            <p>
              Nu îți cerem nume, e-mail sau alte date personale. Fotografiile și videoclipurile trimise sunt păstrate
              într-un spațiu de stocare privat și pot fi văzute doar de organizatorii evenimentului. Nimic nu este
              publicat automat. Te rugăm să trimiți doar imagini în care cei surprinși sunt de acord să apară. Dacă
              dorești ștergerea unui material, adresează-te organizatorilor.
            </p>
          </details>
        </footer>
      </div>
    </main>
  );
}
