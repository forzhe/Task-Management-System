import { describe, expect, it } from "vitest";
import { FinanceCsvSource, summarizeFinance, summarizeFinanceByDay } from "./finance-csv.js";

describe("FinanceCsvSource", () => {
  const source = new FinanceCsvSource();

  it("parses Alipay/WeChat style headers with 收/支 direction", () => {
    const csv = [
      "交易时间,金额,收/支,交易分类",
      "2026-06-14 12:30,68,支出,外卖",
      "2026-06-14 20:00,1299,支出,数码",
      "2026-06-15,8000,收入,工资",
    ].join("\n");
    const txns = source.parseTxns(csv);
    expect(txns).toHaveLength(3);
    expect(txns[0]).toMatchObject({ date: "2026-06-14", amount: 68, direction: "expense", category: "外卖" });
    expect(txns[2]).toMatchObject({ direction: "income", amount: 8000 });
  });

  it("aggregates by day and computes totals", () => {
    const csv = [
      "日期,金额,收/支,分类",
      "2026-06-14,100,支出,购物",
      "2026-06-14,50,支出,外卖",
      "2026-06-15,200,收入,退款",
    ].join("\n");
    const txns = source.parseTxns(csv);
    const days = summarizeFinanceByDay(txns);
    expect(days).toHaveLength(2);
    expect(days[0]).toMatchObject({ date: "2026-06-14", expense: 150, income: 0 });
    expect(days[1]).toMatchObject({ date: "2026-06-15", income: 200 });
  });

  it("detects impulse signals: large expense + entertainment total", () => {
    const rows = ["交易时间,金额,收/支,交易分类", "2026-06-14,1299,支出,数码"];
    // 10 笔外卖各 60 → 娱乐/冲动类目合计 600 ≥ 300，且高频 ≥ 8 笔
    for (let i = 0; i < 10; i += 1) rows.push(`2026-06-1${i % 5},60,支出,外卖`);
    const summary = summarizeFinance(source.parseTxns(rows.join("\n")));
    expect(summary.impulseFlags.some((f) => f.includes("大额支出"))).toBe(true);
    expect(summary.impulseFlags.some((f) => f.includes("娱乐/冲动"))).toBe(true);
    expect(summary.impulseFlags.some((f) => f.includes("高频"))).toBe(true);
    expect(summary.topCategories[0]?.category).toBeDefined();
  });

  it("returns empty without date or amount columns", () => {
    expect(source.parseTxns("foo,bar\n1,2")).toHaveLength(0);
    expect(source.parseTxns("")).toHaveLength(0);
  });
});
