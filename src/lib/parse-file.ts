/**
 * Server-side file parsers.
 * Returns { text, pageCount } for each supported format.
 * pageCount is null for formats that don't have a page concept (e.g. DOCX).
 */

import { PDFParse } from "pdf-parse";
import mammoth from "mammoth";
import JSZip from "jszip";

export interface ParseResult {
  text: string;
  pageCount: number | null;
}

export async function parseFile(
  buffer: Buffer,
  mimeType: string
): Promise<ParseResult> {
  const lowerType = mimeType.toLowerCase();
  console.log(`[parse-file] ▶ parseFile — mimeType="${mimeType}" bufferSize=${buffer.length}`);

  if (lowerType.includes("pdf")) {
    return parsePdf(buffer);
  }

  if (
    lowerType.includes("wordprocessingml") ||
    lowerType.includes("docx") ||
    lowerType.includes("msword")
  ) {
    return parseDocx(buffer);
  }

  if (
    lowerType.includes("presentationml") ||
    lowerType.includes("pptx") ||
    lowerType.includes("powerpoint")
  ) {
    return parsePptx(buffer);
  }

  if (
    lowerType.includes("spreadsheetml") ||
    lowerType.includes("excel") ||
    lowerType.includes("xlsx") ||
    lowerType.includes("xls") ||
    lowerType.includes("csv")
  ) {
    return parseSpreadsheet(buffer);
  }

  // Some browsers send a generic type for .xlsx — sniff the ZIP signature ("PK")
  // so a spreadsheet still parses instead of falling through to garbage text.
  if (looksLikeZip(buffer)) {
    return parseSpreadsheet(buffer);
  }

  // Plain text fallback (covers .txt and .csv reported as text/plain)
  return { text: buffer.toString("utf-8"), pageCount: null };
}

function looksLikeZip(buffer: Buffer): boolean {
  return buffer.length > 3 && buffer[0] === 0x50 && buffer[1] === 0x4b; // "PK"
}

async function parsePdf(buffer: Buffer): Promise<ParseResult> {
  console.log(`[parse-file] ▶ parsePdf — size=${buffer.length}`);
  const parser = new PDFParse({ data: buffer });
  const result = await parser.getText();
  console.log(`[parse-file] ✓ pdf-parse done — pages=${result.total} textLen=${result.text.length}`);

  // Return whatever text pdf-parse extracted. Image-only (scanned) PDFs carry
  // little or no embedded text; we do NOT OCR them (the paid Claude-vision
  // fallback was removed). The caller surfaces a clear "no readable content —
  // paste the text or upload a text-based file" message when the text is empty.
  return { text: result.text, pageCount: result.total };
}

async function parseDocx(buffer: Buffer): Promise<ParseResult> {
  const result = await mammoth.extractRawText({ buffer });
  return {
    text: result.value,
    pageCount: null,
  };
}

async function parsePptx(buffer: Buffer): Promise<ParseResult> {
  const zip = await JSZip.loadAsync(buffer);
  const slideFiles: string[] = [];

  zip.forEach((relativePath) => {
    // Slide XML files follow the pattern ppt/slides/slide{N}.xml
    if (/^ppt\/slides\/slide\d+\.xml$/i.test(relativePath)) {
      slideFiles.push(relativePath);
    }
  });

  // Sort slides numerically
  slideFiles.sort((a, b) => {
    const numA = parseInt(a.match(/\d+/)?.[0] ?? "0", 10);
    const numB = parseInt(b.match(/\d+/)?.[0] ?? "0", 10);
    return numA - numB;
  });

  const slideTexts: string[] = [];

  for (const filePath of slideFiles) {
    const file = zip.file(filePath);
    if (!file) continue;
    const xmlText = await file.async("string");
    // Extract text nodes from <a:t> tags
    const matches = xmlText.match(/<a:t[^>]*>([^<]*)<\/a:t>/g) ?? [];
    const text = matches
      .map((m) => m.replace(/<[^>]+>/g, ""))
      .filter(Boolean)
      .join(" ");
    if (text.trim()) slideTexts.push(text.trim());
  }

  return {
    text: slideTexts.join("\n\n"),
    pageCount: slideFiles.length,
  };
}

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, "&"); // last, so we don't double-decode
}

/** Pulls the concatenated text of all `<t>` nodes inside one XML fragment. */
function textOfNodes(fragment: string): string {
  const ts = fragment.match(/<t[^>]*>([\s\S]*?)<\/t>/g) ?? [];
  return ts.map((t) => decodeXmlEntities(t.replace(/<[^>]+>/g, ""))).join("");
}

/**
 * Extracts a readable, tab-separated text table from a spreadsheet.
 *
 * .xlsx is a ZIP of XML (a shared-strings table + one XML per sheet), so we read
 * it with JSZip the same way `parsePptx` reads slides — no new dependency. A
 * non-ZIP buffer (a .csv, or a legacy binary .xls) falls back to UTF-8 text,
 * which is exactly right for CSV and a best effort for .xls.
 */
async function parseSpreadsheet(buffer: Buffer): Promise<ParseResult> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(buffer);
  } catch {
    return { text: buffer.toString("utf-8"), pageCount: null }; // CSV or legacy .xls
  }

  // Shared strings: cells with t="s" reference this table by index.
  const shared: string[] = [];
  const ssFile = zip.file("xl/sharedStrings.xml");
  if (ssFile) {
    const xml = await ssFile.async("string");
    for (const si of xml.match(/<si>[\s\S]*?<\/si>/g) ?? []) shared.push(textOfNodes(si));
  }

  const sheetPaths: string[] = [];
  zip.forEach((p) => {
    if (/^xl\/worksheets\/sheet\d+\.xml$/i.test(p)) sheetPaths.push(p);
  });
  sheetPaths.sort((a, b) => (parseInt(a.match(/\d+/)?.[0] ?? "0", 10)) - (parseInt(b.match(/\d+/)?.[0] ?? "0", 10)));

  const sheetTexts: string[] = [];
  for (const sheetPath of sheetPaths) {
    const file = zip.file(sheetPath);
    if (!file) continue;
    const xml = await file.async("string");
    const lines: string[] = [];
    for (const row of xml.match(/<row\b[\s\S]*?<\/row>/g) ?? []) {
      const cells: string[] = [];
      for (const cell of row.match(/<c\b[^>]*>[\s\S]*?<\/c>|<c\b[^>]*\/>/g) ?? []) {
        if (/\bt="s"/.test(cell)) {
          const v = cell.match(/<v[^>]*>([\s\S]*?)<\/v>/);
          cells.push(v ? shared[Number(v[1])] ?? "" : "");
        } else if (/<is>/.test(cell)) {
          cells.push(textOfNodes(cell));
        } else {
          const v = cell.match(/<v[^>]*>([\s\S]*?)<\/v>/);
          cells.push(v ? decodeXmlEntities(v[1]) : "");
        }
      }
      const line = cells.map((c) => c.trim()).join("\t").trimEnd();
      if (line.trim()) lines.push(line);
    }
    if (lines.length > 0) sheetTexts.push(lines.join("\n"));
  }

  // Nothing extractable (e.g. an all-formula sheet) → empty, so the caller shows
  // its "no readable content — paste the text" message rather than crashing.
  return { text: sheetTexts.join("\n\n"), pageCount: sheetPaths.length || null };
}
