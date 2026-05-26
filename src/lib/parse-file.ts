/**
 * Server-side file parsers.
 * Returns { text, pageCount } for each supported format.
 * pageCount is null for formats that don't have a page concept (e.g. DOCX).
 */

import { PDFParse } from "pdf-parse";
import mammoth from "mammoth";
import JSZip from "jszip";
import Anthropic from "@anthropic-ai/sdk";

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

  const stripped = result.text.replace(/--\s*\d+\s*of\s*\d+\s*--/g, "").trim();
  if (stripped.length > 50) {
    return { text: result.text, pageCount: result.total };
  }

  // Scanned/image-based PDF — use Claude vision as fallback
  return parsePdfWithVision(buffer, result.total);
}

async function parsePdfWithVision(
  buffer: Buffer,
  pageCount: number | null
): Promise<ParseResult> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const response = await client.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 8192,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "document",
            source: {
              type: "base64",
              media_type: "application/pdf",
              data: buffer.toString("base64"),
            },
          },
          {
            type: "text",
            text: "Extract all text content from this PDF. Return only the extracted text, preserving structure like headings, bullet points, and tables. No commentary.",
          },
        ],
      },
    ],
  });

  const block = response.content[0];
  const text = block.type === "text" ? block.text : "";
  return { text, pageCount };
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
