import assert from "node:assert/strict";
import test from "node:test";
import { extractWebDocument } from "./extract.js";
import type { WebResource } from "./types.js";

function resource(body: string, contentType = "text/html; charset=utf-8"): WebResource {
  return {
    requestedUrl: "https://example.com/articles/test",
    finalUrl: "https://example.com/articles/test",
    status: 200,
    headers: { "content-type": contentType },
    body: Buffer.from(body),
    redirects: [],
    durationMs: 1,
  };
}

test("extractWebDocument turns article HTML into clean markdown and stable links", async () => {
  const document = await extractWebDocument(resource(`<!doctype html>
    <html><head><title>Fallback title</title>
      <meta property="og:title" content="Architecture Notes">
      <meta property="article:published_time" content="2026-09-04T10:00:00Z">
    </head><body><nav>Navigation that should not be the article</nav>
      <article><h1>Architecture Notes</h1>
        <p>This is the main article content with enough meaningful prose for reliable reader extraction. It explains a modular provider architecture, safe network boundaries, source provenance, and deterministic identifiers.</p>
        <p>Read the <a href="/docs/reference?utm_source=test#part">reference guide</a>.</p>
        <script>doNotInclude()</script>
      </article></body></html>`));

  assert.equal(document.title, "Architecture Notes");
  assert.equal(document.publishedAt, "2026-09-04T10:00:00.000Z");
  assert.match(document.markdown, /main article content/u);
  assert.doesNotMatch(document.markdown, /doNotInclude/u);
  assert.equal(document.links.length, 1);
  assert.deepEqual(document.links[0], {
    id: "L1",
    text: "reference guide",
    url: "https://example.com/docs/reference?utm_source=test",
  });
  assert.match(document.markdown, /"L1"/u);
});

test("extractWebDocument formats JSON and rejects binary content", async () => {
  const json = await extractWebDocument(resource('{"ok":true,"items":[1,2]}', "application/json"));
  assert.equal(json.markdown, '{\n  "ok": true,\n  "items": [\n    1,\n    2\n  ]\n}');
  await assert.rejects(
    extractWebDocument(resource("binary", "application/octet-stream")),
    /Unsupported web content type/u,
  );
});
