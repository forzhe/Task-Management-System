import type { CalendarEvent } from "@nexus/shared";

/**
 * §6.7.1 日历数据源（.ics 文件解析，无需 OAuth）。
 * 支持 Google Calendar / Outlook 导出的常见 iCalendar 格式。
 */
export class CalendarIcsSource {
  readonly kind = "calendar" as const;
  readonly mode = "csv_import" as const;

  parse(input: string): CalendarEvent[] {
    const lines = unfold(input);
    const events: CalendarEvent[] = [];
    let cur: Partial<{ uid: string; title: string; start: string; end: string; location: string; allDay: boolean }> | null =
      null;

    for (const line of lines) {
      if (line === "BEGIN:VEVENT") {
        cur = {};
        continue;
      }
      if (line === "END:VEVENT") {
        if (cur?.start) {
          events.push({
            uid: cur.uid || `ics-${cur.start}-${cur.title ?? ""}`,
            title: cur.title || "(无标题)",
            start: cur.start,
            end: cur.end ?? null,
            location: cur.location ?? null,
            allDay: cur.allDay ?? false,
          });
        }
        cur = null;
        continue;
      }
      if (!cur) continue;

      const colon = line.indexOf(":");
      if (colon === -1) continue;
      const rawKey = line.slice(0, colon);
      const value = line.slice(colon + 1).trim();
      const key = rawKey.split(";")[0]?.toUpperCase() ?? "";
      const params = rawKey.toUpperCase();

      if (key === "UID") cur.uid = value;
      else if (key === "SUMMARY") cur.title = unescapeIcs(value);
      else if (key === "LOCATION") cur.location = unescapeIcs(value);
      else if (key === "DTSTART") {
        const parsed = parseIcsDate(value, params);
        cur.start = parsed.iso;
        cur.allDay = parsed.allDay;
      } else if (key === "DTEND") {
        cur.end = parseIcsDate(value, params).iso;
      }
    }
    return events;
  }
}

/** RFC5545 行展开：续行以空格/制表符开头，拼回上一行 */
function unfold(input: string): string[] {
  const raw = input.split(/\r?\n/);
  const out: string[] = [];
  for (const line of raw) {
    if ((line.startsWith(" ") || line.startsWith("\t")) && out.length > 0) {
      out[out.length - 1] += line.slice(1);
    } else {
      out.push(line);
    }
  }
  return out.map((l) => l.trimEnd());
}

function unescapeIcs(s: string): string {
  return s.replace(/\\n/gi, " ").replace(/\\,/g, ",").replace(/\\;/g, ";").replace(/\\\\/g, "\\");
}

/** 解析 ICS 日期：UTC(Z)/本地/全天(VALUE=DATE) → ISO + allDay 标记 */
function parseIcsDate(value: string, params: string): { iso: string; allDay: boolean } {
  const isDate = params.includes("VALUE=DATE") || /^\d{8}$/.test(value);
  const m = value.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?/);
  if (!m) return { iso: new Date().toISOString(), allDay: false };
  const [, y, mo, d, hh, mm, ss, z] = m;
  if (isDate || !hh) {
    // 全天：本地零点
    return { iso: new Date(Number(y), Number(mo) - 1, Number(d)).toISOString(), allDay: true };
  }
  if (z) {
    // UTC
    return {
      iso: new Date(
        Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(hh), Number(mm), Number(ss ?? 0)),
      ).toISOString(),
      allDay: false,
    };
  }
  // 浮动/带 TZID：按本地时间处理
  return {
    iso: new Date(
      Number(y),
      Number(mo) - 1,
      Number(d),
      Number(hh),
      Number(mm),
      Number(ss ?? 0),
    ).toISOString(),
    allDay: false,
  };
}
