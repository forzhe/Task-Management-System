import { copyFileSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

export interface BrowserVisit {
  url: string;
  title: string;
  visitTime: string;
  visitCount: number;
  browser: "chrome" | "edge";
}

// Chrome/Edge history DB paths on Windows
const HISTORY_PATHS: Array<{ browser: "chrome" | "edge"; path: string }> = [
  {
    browser: "chrome",
    path: join(
      process.env.LOCALAPPDATA ?? "",
      "Google",
      "Chrome",
      "User Data",
      "Default",
      "History",
    ),
  },
  {
    browser: "edge",
    path: join(
      process.env.LOCALAPPDATA ?? "",
      "Microsoft",
      "Edge",
      "User Data",
      "Default",
      "History",
    ),
  },
];

export class BrowserHistoryClient {
  async getRecentVisits(limitHours = 8): Promise<BrowserVisit[]> {
    const visits: BrowserVisit[] = [];
    const cutoff = Date.now() - limitHours * 60 * 60 * 1000;

    for (const { browser, path } of HISTORY_PATHS) {
      if (!existsSync(path)) continue;
      try {
        const fetched = this.readHistory(browser, path, cutoff);
        visits.push(...fetched);
      } catch {
        // Browser may have the file locked; skip silently
      }
    }

    return visits.sort((a, b) => b.visitTime.localeCompare(a.visitTime)).slice(0, 200);
  }

  private readHistory(
    browser: "chrome" | "edge",
    dbPath: string,
    cutoffMs: number,
  ): BrowserVisit[] {
    const tmpDir = tmpdir();
    mkdirSync(tmpDir, { recursive: true });
    const tmpPath = join(tmpDir, `nexus-${browser}-history-${Date.now()}.db`);

    try {
      // Copy to temp because browser keeps file locked while open
      copyFileSync(dbPath, tmpPath);
      const db = new DatabaseSync(tmpPath, { open: true });

      // Chrome/Edge stores time as microseconds since 1601-01-01
      // Convert to ms since epoch: subtract 11644473600000000 microseconds (Win epoch offset)
      const WIN_EPOCH_OFFSET_MS = 11644473600000n;
      const cutoffChrome = BigInt(cutoffMs) * 1000n + WIN_EPOCH_OFFSET_MS * 1000n;

      const rows = db
        .prepare(
          `SELECT u.url, u.title, v.visit_time, u.visit_count
           FROM visits v
           JOIN urls u ON u.id = v.url
           WHERE v.visit_time > ?
           ORDER BY v.visit_time DESC
           LIMIT 200`,
        )
        .all(cutoffChrome.toString()) as Array<{
        url: string;
        title: string;
        visit_time: string;
        visit_count: number;
      }>;

      db.close();

      return rows.map((row) => {
        const visitTimeMicros = BigInt(row.visit_time);
        const visitTimeMs = (visitTimeMicros - WIN_EPOCH_OFFSET_MS * 1000n) / 1000n;
        return {
          url: row.url,
          title: row.title || row.url,
          visitTime: new Date(Number(visitTimeMs)).toISOString(),
          visitCount: row.visit_count,
          browser,
        };
      });
    } finally {
      try {
        rmSync(tmpPath);
      } catch {
        // cleanup best-effort
      }
    }
  }
}
