// PDF-Export mit echten Seitenmaßen, TrimBox und BleedBox.
// Der Posterinhalt wird als hochauflösendes Raster eingebettet (das Layout
// stammt aus derselben Pipeline wie PNG und Vorschau); die Seite trägt die
// korrekten physischen Maße in Punkt, sodass Druckereien das Format sauber
// übernehmen.
import { PDFDocument } from "pdf-lib";
import sharp from "sharp";
import type { Album, PosterConfig } from "./types";
import { renderPng } from "./render";
import { MM_TO_PT } from "./formats";

export async function renderPdf(album: Album, config: PosterConfig): Promise<Buffer> {
  // Fürs PDF genügen 300 DPI fürs Raster — Text bleibt bei 300 gestochen
  // genug, und A1/600 würde nur die Datei aufblähen.
  const pdfConfig: PosterConfig = { ...config, dpi: config.dpi === 600 ? 300 : config.dpi };
  const { png } = await renderPng(album, pdfConfig);

  // JPEG statt PNG einbetten: bei Postern mit Foto-Cover um Größenordnungen kleiner
  const jpeg = await sharp(png).flatten({ background: "#FFFFFF" }).jpeg({ quality: 95 }).toBuffer();

  const slugMm = config.cropMarks ? 5 : 0;
  const totalWmm = config.format.widthMm + 2 * (config.bleedMm + slugMm);
  const totalHmm = config.format.heightMm + 2 * (config.bleedMm + slugMm);

  const pageW = totalWmm * MM_TO_PT;
  const pageH = totalHmm * MM_TO_PT;

  const doc = await PDFDocument.create();
  doc.setTitle(`${album.artist} – ${album.title}`);
  doc.setCreator("posterlab");

  const page = doc.addPage([pageW, pageH]);
  const image = await doc.embedJpg(jpeg);
  page.drawImage(image, { x: 0, y: 0, width: pageW, height: pageH });

  // TrimBox = Endformat, BleedBox = Endformat + Beschnitt
  const trimX = (config.bleedMm + slugMm) * MM_TO_PT;
  const trimY = (config.bleedMm + slugMm) * MM_TO_PT;
  const trimW = config.format.widthMm * MM_TO_PT;
  const trimH = config.format.heightMm * MM_TO_PT;
  page.setTrimBox(trimX, trimY, trimW, trimH);
  page.setBleedBox(
    slugMm * MM_TO_PT,
    slugMm * MM_TO_PT,
    (config.format.widthMm + 2 * config.bleedMm) * MM_TO_PT,
    (config.format.heightMm + 2 * config.bleedMm) * MM_TO_PT
  );

  const bytes = await doc.save();
  return Buffer.from(bytes);
}
