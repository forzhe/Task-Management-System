import { readFile, readdir } from "node:fs/promises";
import { extname, join } from "node:path";

const roots = ["apps", "packages", "prompts", "docs", "scripts"];
const textExtensions = new Set([".css", ".json", ".md", ".ts", ".vue"]);
const ignoredDirectories = new Set([
  ".tmp",
  ".turbo",
  "dist",
  "node_modules",
  "NEXUS-7",
  "src-tauri",
]);

const suspiciousChars = [
  0xfffd, 0x6d93, 0x6d60, 0x7039, 0x4e80, 0x93c3, 0x9418, 0x934a, 0x934b, 0x95c0, 0x9394, 0x7470,
  0x93c8, 0x8a99, 0x9359, 0x93ac, 0x941a, 0x6a0d, 0x20ac, 0x951f, 0x951b, 0x94b1, 0x9428,
].map((codePoint) => String.fromCharCode(codePoint));

const suspiciousFragments = [
  [0x20ac, 0x3f],
  [0x951f, 0x3f],
  [0x6d93, 0x20ac],
  [0x4e3b, 0x6d93],
].map((codePoints) => codePoints.map((codePoint) => String.fromCharCode(codePoint)).join(""));

async function main() {
  const failures: string[] = [];
  for (const root of roots) {
    await scan(join(process.cwd(), root), failures);
  }

  if (failures.length > 0) {
    console.error(["UTF-8 guard found suspicious text:", ...failures].join("\n"));
    process.exit(1);
  }
  console.log("UTF-8 guard passed.");
}

async function scan(path: string, failures: string[]): Promise<void> {
  const entries = await readdir(path, { withFileTypes: true });
  for (const entry of entries) {
    const child = join(path, entry.name);
    if (entry.isDirectory()) {
      if (!ignoredDirectories.has(entry.name)) await scan(child, failures);
      continue;
    }
    if (!entry.isFile() || !textExtensions.has(extname(entry.name))) continue;
    const content = await readFile(child, "utf8");
    const hit = findSuspiciousText(content);
    if (hit) failures.push(`${child} contains ${hit}`);
  }
}

export function findSuspiciousText(content: string): string | undefined {
  const charHit = suspiciousChars.find((char) => content.includes(char));
  if (charHit) return `U+${charHit.charCodeAt(0).toString(16).toUpperCase()}`;
  const fragmentHit = suspiciousFragments.find((fragment) => content.includes(fragment));
  if (fragmentHit) {
    return fragmentHit
      .split("")
      .map((char) => `U+${char.charCodeAt(0).toString(16).toUpperCase()}`)
      .join("+");
  }
  return undefined;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
