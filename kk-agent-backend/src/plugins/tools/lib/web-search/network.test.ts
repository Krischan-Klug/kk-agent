import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import { isPrivateOrReservedAddress, requireSuccessfulStatus, safeFetch } from "./network.js";

test("private and reserved IP ranges are rejected", () => {
  for (const address of [
    "0.0.0.0",
    "10.1.2.3",
    "100.64.0.1",
    "127.0.0.1",
    "169.254.1.1",
    "172.16.0.1",
    "192.168.1.1",
    "198.51.100.2",
    "203.0.113.3",
    "::1",
    "fd00::1",
    "fe80::1",
    "2001:db8::1",
    "::ffff:127.0.0.1",
  ]) assert.equal(isPrivateOrReservedAddress(address), true, address);
  assert.equal(isPrivateOrReservedAddress("1.1.1.1"), false);
  assert.equal(isPrivateOrReservedAddress("2606:4700:4700::1111"), false);
});

test("safeFetch blocks localhost by default", async () => {
  await assert.rejects(
    safeFetch("http://127.0.0.1:45678/"),
    (error: unknown) => error instanceof Error && error.message.includes("private or reserved"),
  );
});

test("safeFetch enforces redirects, status checks, and response size", async (t) => {
  const server = createServer((request, response) => {
    if (request.url === "/redirect") {
      response.writeHead(302, { location: "/ok" });
      response.end();
      return;
    }
    if (request.url === "/large") {
      response.writeHead(200, { "content-type": "text/plain" });
      response.end("x".repeat(2_048));
      return;
    }
    if (request.url === "/missing") {
      response.writeHead(404, { "content-type": "text/plain" });
      response.end("missing");
      return;
    }
    if (request.url === "/limited") {
      response.writeHead(429, { "content-type": "text/plain", "retry-after": "2" });
      response.end("limited");
      return;
    }
    response.writeHead(200, { "content-type": "text/plain" });
    response.end("ok");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const base = `http://127.0.0.1:${address.port}`;

  const redirected = await safeFetch(`${base}/redirect`, { allowPrivateAddresses: true });
  assert.equal(redirected.body.toString(), "ok");
  assert.deepEqual(redirected.redirects, [`${base}/ok`]);

  const missing = await safeFetch(`${base}/missing`, { allowPrivateAddresses: true });
  assert.throws(() => requireSuccessfulStatus(missing), /HTTP 404/u);

  const limited = await safeFetch(`${base}/limited`, { allowPrivateAddresses: true });
  assert.throws(
    () => requireSuccessfulStatus(limited),
    (error: unknown) => error instanceof Error
      && "options" in error
      && (error as { options: { details?: { retryAfterMs?: number } } }).options.details?.retryAfterMs === 2_000,
  );

  await assert.rejects(
    safeFetch(`${base}/large`, { allowPrivateAddresses: true, maxBytes: 1_024 }),
    /1024-byte limit/u,
  );
});

test("safeFetch timeout covers the response body", async (t) => {
  const server = createServer((_request, response) => {
    response.writeHead(200, { "content-type": "text/plain" });
    response.write("started");
    setTimeout(() => response.end("finished"), 1_200);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  const address = server.address();
  assert.ok(address && typeof address === "object");

  await assert.rejects(
    safeFetch(`http://127.0.0.1:${address.port}/slow`, {
      allowPrivateAddresses: true,
      timeoutMs: 1_000,
    }),
    /timed out/u,
  );
});
