import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { unzipSync } from "fflate";

const UV_VERSION = "0.12.13";
const WINDOWS_TARGETS = {
  x64: {
    archive: "uv-x86_64-pc-windows-msvc.zip",
    sha256: "a86c9dc7bad9b03f388583b7187c05fe9951c2e0d392217e8fd43d97787f6ec2",
  },
  arm64: {
    archive: "uv-aarch64-pc-windows-msvc.zip",
    sha256: "1efb2654b06e7063d4ac1fc9d49a9bda9a6704d82f035b589a2751a592f14151",
  },
  ia32: {
    archive: "uv-i686-pc-windows-msvc.zip",
    sha256: "4ddcdf859d3bd337a156a2fc567e685e4b3d61e07b4a2dbbed7aeb4325e116ac",
  },
};

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(scriptDir, "..");
const runtimeRoot = path.join(packageRoot, "managed-runtimes", "uv");
const requestedArch = process.env.npm_config_arch || process.arch;
const target = WINDOWS_TARGETS[requestedArch];

if (!target) {
  throw new Error(`No bundled uv runtime is defined for Windows architecture ${requestedArch}.`);
}

function archiveFile(files, basename) {
  const match = Object.entries(files).find(([name]) => path.posix.basename(name) === basename);
  if (!match) throw new Error(`${basename} is missing from the uv release archive.`);
  return match[1];
}

async function isCurrent() {
  try {
    const marker = JSON.parse(await readFile(path.join(runtimeRoot, "runtime.json"), "utf8"));
    await Promise.all([
      readFile(path.join(runtimeRoot, "uv.exe")),
      readFile(path.join(runtimeRoot, "uvx.exe")),
    ]);
    return marker.version === UV_VERSION && marker.arch === requestedArch;
  } catch {
    return false;
  }
}

async function download(url) {
  const response = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(300_000) });
  if (!response.ok) throw new Error(`Failed to download ${url}: HTTP ${response.status}.`);
  return new Uint8Array(await response.arrayBuffer());
}

async function main() {
  if (await isCurrent()) return;

  const url = `https://releases.astral.sh/github/uv/releases/download/${UV_VERSION}/${target.archive}`;
  const archive = await download(url);
  const digest = createHash("sha256").update(archive).digest("hex");
  if (digest !== target.sha256) {
    throw new Error(`Checksum mismatch for ${target.archive}.`);
  }

  const files = unzipSync(archive);
  const parent = path.dirname(runtimeRoot);
  await mkdir(parent, { recursive: true });
  const temporaryRoot = await mkdtemp(path.join(parent, ".uv-"));

  try {
    await Promise.all([
      writeFile(path.join(temporaryRoot, "uv.exe"), archiveFile(files, "uv.exe")),
      writeFile(path.join(temporaryRoot, "uvx.exe"), archiveFile(files, "uvx.exe")),
      writeFile(path.join(temporaryRoot, "runtime.json"), `${JSON.stringify({ version: UV_VERSION, arch: requestedArch }, null, 2)}\n`),
    ]);
    await rm(runtimeRoot, { recursive: true, force: true });
    await rename(temporaryRoot, runtimeRoot);
  } catch (error) {
    await rm(temporaryRoot, { recursive: true, force: true });
    throw error;
  }
}

await main();
