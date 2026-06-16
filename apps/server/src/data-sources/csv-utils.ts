// CSV 解析公用工具：health/finance 等数据源共用。

export function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/["']/g, "");
}

/** 简单 CSV：逗号分隔 + 双引号包裹 */
export function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

/** 多种日期格式归一为 YYYY-MM-DD（支持带时间的串）*/
export function normalizeDate(value: string): string | null {
  const v = value.trim();
  if (!v) return null;
  const m = v.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (m) {
    return `${m[1]}-${String(m[2]).padStart(2, "0")}-${String(m[3]).padStart(2, "0")}`;
  }
  const d = new Date(v);
  if (!Number.isNaN(d.getTime())) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
  return null;
}

/** 抽取数字（容忍 ¥、千分位、货币符号）*/
export function parseNumber(value: string): number | null {
  const cleaned = value.replace(/[^\d.-]/g, "");
  if (!cleaned || cleaned === "-" || cleaned === ".") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/** 在表头里找第一个命中关键词的列下标 */
export function findColumn(header: string[], keys: string[]): number {
  return header.findIndex((h) => keys.some((k) => h.includes(k)));
}
