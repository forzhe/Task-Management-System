import type { FinanceDaySummary, FinanceSummary, NormalizedSignal } from "@nexus/shared";
import { findColumn, normalizeDate, normalizeHeader, parseNumber, splitCsvLine } from "./csv-utils.js";
import type { DataSource } from "./health-csv.js";

const DATE_KEYS = ["交易时间", "交易创建时间", "date", "日期", "time", "时间"];
const AMOUNT_KEYS = ["金额", "amount", "金额(元)", "发生金额"];
const DIRECTION_KEYS = ["收/支", "收支", "type", "类型", "交易类型", "direction", "in/out"];
const CATEGORY_KEYS = ["交易分类", "交易类型", "category", "分类", "商品说明", "商品", "交易对方", "备注", "note"];

/** 收/支方向归一 */
function classifyDirection(raw: string): "expense" | "income" | null {
  const v = raw.trim();
  if (!v) return null;
  if (/支|出|expense|out|消费|支付/i.test(v)) return "expense";
  if (/收|入|income|in|退款|工资/i.test(v)) return "income";
  return null;
}

/** 冲动/娱乐类目关键词 */
const IMPULSE_CATEGORY_KEYS = ["娱乐", "游戏", "外卖", "奶茶", "零食", "购物", "服饰", "美容", "直播", "打赏", "盲盒"];
const LARGE_EXPENSE_THRESHOLD = 500; // 单笔大额阈值

interface FinanceTxn {
  date: string;
  amount: number;
  direction: "expense" | "income";
  category: string;
}

export class FinanceCsvSource implements DataSource {
  readonly kind = "finance" as const;
  readonly mode = "csv_import" as const;

  parse(input: string): NormalizedSignal[] {
    return this.parseTxns(input).map((t) => ({
      kind: "finance" as const,
      metric: t.direction,
      value: t.amount,
      unit: "yuan",
      date: t.date,
      raw: { category: t.category },
    }));
  }

  parseTxns(input: string): FinanceTxn[] {
    const lines = input
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
    if (lines.length < 2) return [];

    const header = splitCsvLine(lines[0] ?? "").map(normalizeHeader);
    const dateCol = findColumn(header, DATE_KEYS.map((k) => k.toLowerCase()));
    const amountCol = findColumn(header, AMOUNT_KEYS.map((k) => k.toLowerCase()));
    if (dateCol === -1 || amountCol === -1) return [];
    const dirCol = findColumn(header, DIRECTION_KEYS.map((k) => k.toLowerCase()));
    const catCol = findColumn(header, CATEGORY_KEYS.map((k) => k.toLowerCase()));

    const txns: FinanceTxn[] = [];
    for (let i = 1; i < lines.length; i += 1) {
      const cells = splitCsvLine(lines[i] ?? "");
      const date = normalizeDate(cells[dateCol] ?? "");
      const amount = parseNumber(cells[amountCol] ?? "");
      if (!date || amount === null) continue;
      // 方向：有收支列用之；否则按金额正负（负=支出），再否则默认支出
      let direction: "expense" | "income" = "expense";
      if (dirCol !== -1) {
        const d = classifyDirection(cells[dirCol] ?? "");
        if (d) direction = d;
      } else if (amount < 0) {
        direction = "expense";
      }
      const category = (catCol !== -1 ? cells[catCol] : "")?.trim() || "未分类";
      txns.push({ date, amount: Math.abs(amount), direction, category });
    }
    return txns;
  }
}

export function summarizeFinanceByDay(txns: ReturnType<FinanceCsvSource["parseTxns"]>): FinanceDaySummary[] {
  const byDate = new Map<string, FinanceDaySummary>();
  for (const t of txns) {
    const day = byDate.get(t.date) ?? { date: t.date, expense: 0, income: 0 };
    if (t.direction === "expense") day.expense += t.amount;
    else day.income += t.amount;
    byDate.set(t.date, day);
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/** 汇总 + 冲动消费检测（§6.7.6 红线检测）*/
export function summarizeFinance(txns: ReturnType<FinanceCsvSource["parseTxns"]>): FinanceSummary {
  const expenses = txns.filter((t) => t.direction === "expense");
  const totalExpense = expenses.reduce((s, t) => s + t.amount, 0);
  const totalIncome = txns.filter((t) => t.direction === "income").reduce((s, t) => s + t.amount, 0);

  const byCategory = new Map<string, number>();
  const categoryCount = new Map<string, number>();
  for (const t of expenses) {
    byCategory.set(t.category, (byCategory.get(t.category) ?? 0) + t.amount);
    categoryCount.set(t.category, (categoryCount.get(t.category) ?? 0) + 1);
  }
  const topCategories = [...byCategory.entries()]
    .map(([category, amount]) => ({ category, amount: Math.round(amount) }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 5);

  const impulseFlags: string[] = [];
  // 大额单笔
  const large = expenses.filter((t) => t.amount >= LARGE_EXPENSE_THRESHOLD);
  if (large.length > 0) {
    impulseFlags.push(`${large.length} 笔大额支出（单笔 ≥ ${LARGE_EXPENSE_THRESHOLD}），最高 ${Math.round(Math.max(...large.map((t) => t.amount)))}`);
  }
  // 娱乐/冲动类目总额
  let impulseTotal = 0;
  for (const [cat, amount] of byCategory) {
    if (IMPULSE_CATEGORY_KEYS.some((k) => cat.includes(k))) impulseTotal += amount;
  }
  if (impulseTotal >= 300) {
    impulseFlags.push(`娱乐/冲动类目支出合计 ${Math.round(impulseTotal)}`);
  }
  // 高频小额（同类目 ≥ 8 笔）
  for (const [cat, count] of categoryCount) {
    if (count >= 8 && IMPULSE_CATEGORY_KEYS.some((k) => cat.includes(k))) {
      impulseFlags.push(`「${cat}」高频消费 ${count} 笔`);
    }
  }

  return {
    periodDays: new Set(txns.map((t) => t.date)).size,
    totalExpense: Math.round(totalExpense),
    totalIncome: Math.round(totalIncome),
    txnCount: txns.length,
    topCategories,
    impulseFlags,
  };
}
