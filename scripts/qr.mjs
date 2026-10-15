// Generează codul QR în înaltă rezoluție: npm run qr -- https://adresa-ta.ro
import QRCode from "qrcode";
import { mkdirSync, writeFileSync } from "fs";

const url = process.argv[2] || process.env.NEXT_PUBLIC_SITE_URL;
if (!url || !/^https:\/\//.test(url)) {
  console.error("Folosire: npm run qr -- https://adresa-site-ului");
  process.exit(1);
}
const opts = { errorCorrectionLevel: "H", margin: 2, color: { dark: "#481827", light: "#FFFFFF" } };
mkdirSync("qr", { recursive: true });
await QRCode.toFile("qr/cod-qr.png", url, { ...opts, width: 2400 });
writeFileSync("qr/cod-qr.svg", await QRCode.toString(url, { ...opts, type: "svg" }));
console.log(`Gata: qr/cod-qr.png (2400 px) și qr/cod-qr.svg → ${url}`);
