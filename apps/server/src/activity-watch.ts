import type { ScreenActivitySummary } from "@nexus/shared";

interface AWBucket {
  id: string;
  type: string;
}

interface AWEvent {
  timestamp: string;
  duration: number;
  data: Record<string, string>;
}

type AppCategory = "focus" | "distract" | "other";

const FOCUS_PATTERNS = [
  /^code$/i,
  /^cursor$/i,
  /terminal/i,
  /^powershell$/i,
  /^pwsh$/i,
  /^cmd$/i,
  /obsidian/i,
  /^vim$/i,
  /^nvim$/i,
  /pycharm/i,
  /webstorm/i,
  /intellij/i,
  /^node$/i,
  /^bun$/i,
];

const DISTRACT_PATTERNS = [
  /bilibili/i,
  /youtube/i,
  /tiktok/i,
  /抖音/i,
  /douyin/i,
  /twitter/i,
  /weibo/i,
  /微博/i,
  /twitch/i,
  /netflix/i,
  /爱奇艺/i,
  /优酷/i,
];

function categorize(app: string): AppCategory {
  if (DISTRACT_PATTERNS.some((p) => p.test(app))) return "distract";
  if (FOCUS_PATTERNS.some((p) => p.test(app))) return "focus";
  return "other";
}

function empty(date: string, awConnected: boolean): ScreenActivitySummary {
  return {
    date,
    totalActiveMinutes: 0,
    focusMinutes: 0,
    distractMinutes: 0,
    topApps: [],
    awConnected,
  };
}

export class ActivityWatchClient {
  constructor(private readonly baseUrl: string) {}

  async getStatus(): Promise<{ connected: boolean }> {
    try {
      const res = await fetch(`${this.baseUrl}/api/0/info`, {
        signal: AbortSignal.timeout(2000),
      });
      return { connected: res.ok };
    } catch {
      return { connected: false };
    }
  }

  async getDayActivity(date?: string): Promise<ScreenActivitySummary> {
    const today = date ?? new Date().toISOString().slice(0, 10);
    const { connected } = await this.getStatus();
    if (!connected) return empty(today, false);

    try {
      const bucketsRes = await fetch(`${this.baseUrl}/api/0/buckets`, {
        signal: AbortSignal.timeout(3000),
      });
      if (!bucketsRes.ok) return empty(today, true);

      const buckets: Record<string, AWBucket> = await bucketsRes.json();
      const windowBucket = Object.values(buckets).find((b) => b.type === "currentwindow");
      if (!windowBucket) return empty(today, true);

      const start = `${today}T00:00:00`;
      const end = `${today}T23:59:59`;
      const eventsUrl = `${this.baseUrl}/api/0/buckets/${encodeURIComponent(windowBucket.id)}/events?start=${start}&end=${end}&limit=2000`;
      const eventsRes = await fetch(eventsUrl, { signal: AbortSignal.timeout(5000) });
      if (!eventsRes.ok) return empty(today, true);

      const events: AWEvent[] = await eventsRes.json();

      const appTotals = new Map<string, { seconds: number; category: AppCategory }>();
      for (const ev of events) {
        const app = String(ev.data.app ?? "Unknown");
        const cat = categorize(app);
        const existing = appTotals.get(app);
        if (existing) {
          existing.seconds += ev.duration;
        } else {
          appTotals.set(app, { seconds: ev.duration, category: cat });
        }
      }

      const topApps = Array.from(appTotals.entries())
        .map(([app, { seconds, category }]) => ({
          app,
          minutes: Math.round(seconds / 60),
          category,
        }))
        .sort((a, b) => b.minutes - a.minutes)
        .slice(0, 10);

      const totalActiveMinutes = topApps.reduce((s, a) => s + a.minutes, 0);
      const focusMinutes = topApps
        .filter((a) => a.category === "focus")
        .reduce((s, a) => s + a.minutes, 0);
      const distractMinutes = topApps
        .filter((a) => a.category === "distract")
        .reduce((s, a) => s + a.minutes, 0);

      return {
        date: today,
        totalActiveMinutes,
        focusMinutes,
        distractMinutes,
        topApps,
        awConnected: true,
      };
    } catch {
      return empty(today, false);
    }
  }
}
