export function detectLineEnding(content: string): "\n" | "\r\n" {
  const crlfCount = content.split("\r\n").length - 1;
  const lfCount = content.split("\n").length - 1;
  return crlfCount > lfCount / 2 ? "\r\n" : "\n";
}

export function normalizeLineEndings(content: string, lineEnding: "\n" | "\r\n"): string {
  if (lineEnding === "\r\n") {
    return content.replace(/\r?\n/g, "\r\n");
  }
  return content.replace(/\r\n/g, "\n");
}

export function generateUnifiedDiff(filePath: string, oldContent: string, newContent: string): string {
  const oldLines = oldContent.split(/\r?\n/);
  const newLines = newContent.split(/\r?\n/);
  // Simple line-based diff: find changed ranges
  const hunks: { startOld: number; countOld: number; startNew: number; countNew: number; lines: string[] }[] = [];

  let i = 0;
  let j = 0;
  while (i < oldLines.length || j < newLines.length) {
    if (i < oldLines.length && j < newLines.length && oldLines[i] === newLines[j]) {
      i++;
      j++;
      continue;
    }

    const startOld = i;
    const startNew = j;
    const hunkLines: string[] = [];

    while (i < oldLines.length && j < newLines.length && oldLines[i] !== newLines[j]) {
      // Heuristic: look ahead to find next match
      let found = false;
      for (let a = i; a < Math.min(i + 5, oldLines.length); a++) {
        for (let b = j; b < Math.min(j + 5, newLines.length); b++) {
          if (oldLines[a] === newLines[b]) {
            for (let k = i; k < a; k++) hunkLines.push(`-${oldLines[k]}`);
            for (let k = j; k < b; k++) hunkLines.push(`+${newLines[k]}`);
            i = a;
            j = b;
            found = true;
            break;
          }
        }
        if (found) break;
      }
      if (!found) {
        if (i < oldLines.length) {
          hunkLines.push(`-${oldLines[i]}`);
          i++;
        }
        if (j < newLines.length) {
          hunkLines.push(`+${newLines[j]}`);
          j++;
        }
      }
    }

    // Handle remaining old lines
    while (i < oldLines.length && (j >= newLines.length || oldLines[i] !== newLines[j])) {
      hunkLines.push(`-${oldLines[i]}`);
      i++;
    }
    // Handle remaining new lines
    while (j < newLines.length && (i >= oldLines.length || oldLines[i] !== newLines[j])) {
      hunkLines.push(`+${newLines[j]}`);
      j++;
    }

    hunks.push({
      startOld: startOld + 1,
      countOld: i - startOld,
      startNew: startNew + 1,
      countNew: j - startNew,
      lines: hunkLines,
    });
  }

  if (hunks.length === 0) return "";

  const output = [`--- ${filePath}`, `+++ ${filePath}`];
  for (const hunk of hunks) {
    output.push(`@@ -${hunk.startOld},${hunk.countOld} +${hunk.startNew},${hunk.countNew} @@`);
    output.push(...hunk.lines);
  }
  return output.join("\n");
}

export function countChangedLines(diff: string): number {
  return diff.split("\n").filter((line) => line.startsWith("+") || line.startsWith("-")).length;
}
