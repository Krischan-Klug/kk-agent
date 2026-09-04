import { Readability } from "@mozilla/readability";
import iconv from "iconv-lite";
import { parseHTML } from "linkedom";
import TurndownService from "turndown";
import { WebToolError } from "./errors.js";
import type { ExtractedWebDocument, WebResource } from "./types.js";

const MAX_EXTRACTED_CHARS = 1_500_000;

function charsetFromContentType(contentType: string): string {
  const match = /charset\s*=\s*["']?([^;"'\s]+)/iu.exec(contentType);
  const charset = match?.[1]?.trim().toLowerCase() ?? "utf-8";
  return iconv.encodingExists(charset) ? charset : "utf-8";
}

function decodeBody(resource: WebResource): string {
  return iconv.decode(resource.body, charsetFromContentType(resource.headers["content-type"] ?? ""));
}

function cleanText(value: string): string {
  return value
    .replace(/\u00a0/gu, " ")
    .replace(/[ \t]+/gu, " ")
    .replace(/ *\n */gu, "\n")
    .replace(/\n{3,}/gu, "\n\n")
    .trim()
    .slice(0, MAX_EXTRACTED_CHARS);
}

function metaContent(document: Document, selectors: string[]): string | undefined {
  for (const selector of selectors) {
    const value = document.querySelector(selector)?.getAttribute("content")?.trim();
    if (value) return value;
  }
  return undefined;
}


function normalizeDate(value?: string): string | undefined {
  if (!value) return undefined;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : undefined;
}

function resolveLinks(html: string, baseUrl: string): {
  html: string;
  links: Array<{ id: string; text: string; url: string }>;
} {
  const { document } = parseHTML(`<html><body>${html}</body></html>`);
  const links: Array<{ id: string; text: string; url: string }> = [];
  const seen = new Map<string, string>();
  for (const anchor of [...document.querySelectorAll("a[href]")]) {
    const href = anchor.getAttribute("href") ?? "";
    let url: URL;
    try {
      url = new URL(href, baseUrl);
    } catch {
      anchor.replaceWith(...anchor.childNodes);
      continue;
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      anchor.replaceWith(...anchor.childNodes);
      continue;
    }
    url.hash = "";
    const normalized = url.toString();
    let id = seen.get(normalized);
    if (!id) {
      id = `L${links.length + 1}`;
      seen.set(normalized, id);
      links.push({ id, text: cleanText(anchor.textContent ?? "") || normalized, url: normalized });
    }
    anchor.setAttribute("href", normalized);
    anchor.setAttribute("title", id);
  }
  return { html: document.body.innerHTML, links };
}

function createTurndown(): TurndownService {
  const service = new TurndownService({
    bulletListMarker: "-",
    codeBlockStyle: "fenced",
    emDelimiter: "_",
    headingStyle: "atx",
  });
  service.remove(["script", "style", "noscript", "template", "canvas"]);
  service.remove((node) => node.nodeName === "SVG");
  service.addRule("sourceLinkIds", {
    filter: (node) => node.nodeName === "A" && Boolean(node.getAttribute("title")),
    replacement: (content, node) => {
      const element = node as HTMLElement;
      const url = element.getAttribute("href") ?? "";
      const id = element.getAttribute("title") ?? "";
      return content.trim() ? `[${content.trim()}](${url} "${id}")` : url;
    },
  });
  return service;
}

async function extractPdf(resource: WebResource, contentType: string): Promise<ExtractedWebDocument> {
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: new Uint8Array(resource.body) });
  try {
    const result = await parser.getText({ pageJoiner: "" });
    const markdown = result.pages
      .map((page) => `## Page ${page.num}\n\n${cleanText(page.text)}`)
      .join("\n\n")
      .slice(0, MAX_EXTRACTED_CHARS);
    return {
      url: resource.finalUrl,
      title: null,
      byline: null,
      excerpt: null,
      siteName: null,
      contentType,
      text: markdown,
      markdown,
      links: [],
      pageCount: result.total,
    };
  } finally {
    await parser.destroy();
  }
}

function extractHtml(resource: WebResource, contentType: string): ExtractedWebDocument {
  const html = decodeBody(resource);
  const { document } = parseHTML(html);
  const publishedAt = normalizeDate(metaContent(document as unknown as Document, [
    'meta[property="article:published_time"]',
    'meta[name="date"]',
    'meta[name="pubdate"]',
    'meta[itemprop="datePublished"]',
    "time[datetime]",
  ]) ?? document.querySelector("time[datetime]")?.getAttribute("datetime") ?? undefined);

  const readable = new Readability(document.cloneNode(true) as unknown as Document, {
    charThreshold: 120,
    keepClasses: false,
  }).parse();
  const fallbackTitle = cleanText(document.querySelector("title")?.textContent ?? "") || null;
  const fallbackContent = document.querySelector("main, article, [role=main]")?.innerHTML
    ?? document.body?.innerHTML
    ?? html;
  const articleHtml = readable?.content?.trim() || fallbackContent;
  const resolved = resolveLinks(articleHtml, resource.finalUrl);
  const markdown = cleanText(createTurndown().turndown(resolved.html));
  const text = cleanText(readable?.textContent?.trim() || parseHTML(`<html><body>${resolved.html}</body></html>`).document.body.textContent || markdown);

  return {
    url: resource.finalUrl,
    title: cleanText(readable?.title ?? "") || fallbackTitle,
    byline: cleanText(readable?.byline ?? "") || null,
    excerpt: cleanText(readable?.excerpt ?? "") || null,
    siteName: cleanText(readable?.siteName ?? "") || null,
    publishedAt,
    contentType,
    text,
    markdown,
    links: resolved.links,
  };
}

function extractPlain(resource: WebResource, contentType: string): ExtractedWebDocument {
  let text = cleanText(decodeBody(resource));
  if (contentType.includes("application/json")) {
    try {
      text = JSON.stringify(JSON.parse(text), null, 2).slice(0, MAX_EXTRACTED_CHARS);
    } catch {
      // Preserve malformed JSON as text so the caller can inspect the server response.
    }
  }
  return {
    url: resource.finalUrl,
    title: null,
    byline: null,
    excerpt: null,
    siteName: null,
    contentType,
    text,
    markdown: text,
    links: [],
  };
}

export async function extractWebDocument(resource: WebResource): Promise<ExtractedWebDocument> {
  const contentType = (resource.headers["content-type"] ?? "application/octet-stream").toLowerCase();
  if (contentType.includes("application/pdf") || resource.body.subarray(0, 5).toString("ascii") === "%PDF-") {
    return extractPdf(resource, contentType);
  }
  if (contentType.includes("text/html") || contentType.includes("application/xhtml+xml")) {
    return extractHtml(resource, contentType);
  }
  if (contentType.startsWith("text/") || contentType.includes("application/json") || contentType.includes("application/xml")) {
    return extractPlain(resource, contentType);
  }
  throw new WebToolError(`Unsupported web content type: ${contentType}`, "unsupported_content", { url: resource.finalUrl });
}
