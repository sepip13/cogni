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

  // Plain text fallback
  return { text: buffer.toString("utf-8"), pageCount: null };
}

async function parsePdf(buffer: Buffer): Promise<ParseResult> {
  const parser = new PDFParse({ data: buffer });
  const result = await parser.getText();
  return {
    text: result.text,
    pageCount: result.total,
  };
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
