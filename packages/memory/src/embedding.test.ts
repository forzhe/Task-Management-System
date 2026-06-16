import { describe, expect, it } from "vitest";
import { EMBED_DIM, cosine, embedText } from "./embedding.js";

describe("embedText", () => {
  it("is deterministic and L2-normalized", () => {
    const a = embedText("晨间规划 完成专注任务");
    const b = embedText("晨间规划 完成专注任务");
    expect(a).toEqual(b);
    expect(a).toHaveLength(EMBED_DIM);
    // 归一化：自身余弦 ≈ 1
    expect(cosine(a, a)).toBeCloseTo(1, 5);
  });

  it("empty text → zero vector", () => {
    const z = embedText("   ");
    expect(z.every((v) => v === 0)).toBe(true);
  });

  it("similar text scores higher than unrelated text", () => {
    const query = embedText("健康 运动 跑步 锻炼");
    const close = embedText("今天运动了 跑步 30 分钟，很健康");
    const far = embedText("财务账单 娱乐支出 奶茶");
    expect(cosine(query, close)).toBeGreaterThan(cosine(query, far));
  });
});
