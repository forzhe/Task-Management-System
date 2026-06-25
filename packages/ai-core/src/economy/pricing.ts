import {
  BOUNTY_DEFAULT_WEEKLY_RATE,
  BOUNTY_HORIZON_BY_TIER,
  BOUNTY_HORIZON_CEILING_WEEKS,
  BOUNTY_HORIZON_FLOOR_WEEKS,
  BOUNTY_REPRICE_DRIFT_FACTOR,
  BOUNTY_REPRICE_LOCK_PROGRESS,
  type BountyAlignment,
  type BountyCategory,
  type BountyValueTier,
} from "@nexus/shared";

/**
 * 确定性定价引擎（商城子系统规划书 §6）。
 * 同一套公式扮演两个角色：①离线/解析失败时的兜底定价；②在线时对经济官综合评判价的安全护栏。
 * 纯函数、无副作用、可单测——这是「AI 独占定价」既稳健又离线可用的承重墙。
 */

export interface PricingSignals {
  /** 可持续周赚取率（能量点/周）；<=0 回退默认率 */
  rWeek: number;
  /** 可信度 0-2 */
  credibility: number;
  valueTier: BountyValueTier;
  alignment: BountyAlignment;
}

/** 对齐乘子允许带（经济官在带内取值；离线取中值）*/
export const ALIGN_MULTIPLIER_BANDS: Record<BountyAlignment, readonly [number, number]> = {
  aligned: [0.7, 0.85], // 工具型奖励折扣
  neutral: [0.95, 1.05],
  indulgent: [1.1, 1.25], // 纯享乐加价
  conflict: [1, 1], // 实际会被拒绝，不进入定价
};

/** 可信度乘子（信任折扣，呼应 §6.1：高可信更便宜、低可信更贵）*/
export function credibilityMultiplier(c: number): number {
  if (c >= 1.5) return 0.85;
  if (c >= 1.0) return 1.0;
  if (c >= 0.5) return 1.15;
  return 1.3;
}

export function alignMultiplierMid(verdict: BountyAlignment): number {
  const [lo, hi] = ALIGN_MULTIPLIER_BANDS[verdict];
  return (lo + hi) / 2;
}

/** 有效赚取率：赚取历史为空时回退默认率，避免除零或天价 */
export function effectiveRate(rWeek: number): number {
  return Number.isFinite(rWeek) && rWeek > 0 ? rWeek : BOUNTY_DEFAULT_WEEKLY_RATE;
}

/** 大额取整为「好看的数」*/
export function roundPrice(p: number): number {
  if (p >= 10000) return Math.round(p / 500) * 500;
  if (p >= 2000) return Math.round(p / 100) * 100;
  if (p >= 200) return Math.round(p / 10) * 10;
  return Math.max(1, Math.round(p));
}

/** 价格 → 价值层级（有参考价时用）*/
export function tierFromCny(cny: number): BountyValueTier {
  if (cny >= BOUNTY_HORIZON_BY_TIER.major.valueFloorCny) return "major";
  if (cny >= BOUNTY_HORIZON_BY_TIER.large.valueFloorCny) return "large";
  if (cny >= BOUNTY_HORIZON_BY_TIER.medium.valueFloorCny) return "medium";
  if (cny >= BOUNTY_HORIZON_BY_TIER.light.valueFloorCny) return "light";
  return "small";
}

/**
 * 护栏夹逼：隐含兑现周期 = price / rWeek 必须落在 [floor, ceiling]，否则拉回边界。
 * 防止「秒到手 = 无激励」与「天价 = 挫败」。
 */
export function clampToHorizon(
  price: number,
  rWeek: number,
): { price: number; clampApplied: "none" | "floor" | "ceiling"; impliedHorizonWeeks: number } {
  const rate = effectiveRate(rWeek);
  const floorPrice = rate * BOUNTY_HORIZON_FLOOR_WEEKS;
  const ceilingPrice = rate * BOUNTY_HORIZON_CEILING_WEEKS;
  let clamped = Math.max(1, price);
  let clampApplied: "none" | "floor" | "ceiling" = "none";
  if (clamped < floorPrice) {
    clamped = floorPrice;
    clampApplied = "floor";
  } else if (clamped > ceilingPrice) {
    clamped = ceilingPrice;
    clampApplied = "ceiling";
  }
  const finalPrice = roundPrice(clamped);
  return {
    price: finalPrice,
    clampApplied,
    impliedHorizonWeeks: Number((finalPrice / rate).toFixed(1)),
  };
}

/**
 * 确定性定价：base = R_week × 目标周期(中值) × m_cred × m_align，再过护栏。
 * 用于离线兜底。
 */
export function computeDeterministicPrice(signals: PricingSignals): {
  price: number;
  impliedHorizonWeeks: number;
  mCred: number;
  mAlign: number;
  clampApplied: "none" | "floor" | "ceiling";
} {
  const rate = effectiveRate(signals.rWeek);
  const horizon = BOUNTY_HORIZON_BY_TIER[signals.valueTier].midWeeks;
  const mCred = credibilityMultiplier(signals.credibility);
  const mAlign = alignMultiplierMid(signals.alignment);
  const raw = rate * horizon * mCred * mAlign;
  const clamped = clampToHorizon(raw, signals.rWeek);
  return {
    price: clamped.price,
    impliedHorizonWeeks: clamped.impliedHorizonWeeks,
    mCred,
    mAlign,
    clampApplied: clamped.clampApplied,
  };
}

// ── 离线启发式：价值估算 + 对齐判定（无 LLM 时的 V 与 A）────────────

const TIER_KEYWORDS: ReadonlyArray<{ tier: BountyValueTier; cny: number; words: RegExp }> = [
  {
    tier: "major",
    cny: 12000,
    words: /旅行|旅游|出国|度假|相机|单反|笔记本|电脑|主机|名牌|奢侈|钻|演唱会|健身年卡|课程|手术/,
  },
  {
    tier: "large",
    cny: 4000,
    words:
      /手机|平板|ipad|iphone|耳机|显示器|机械键盘|人体工学椅|球鞋|球拍|游戏机|switch|ps5|显卡|手表|包/i,
  },
  {
    tier: "medium",
    cny: 700,
    words: /电影院|聚餐|大餐|演出|话剧|按摩|spa|月卡|套装|乐高|手办|周边/i,
  },
  { tier: "small", cny: 25, words: /奶茶|咖啡|可乐|零食|糖|小吃|甜点|冰淇淋/ },
  { tier: "light", cny: 150, words: /电影票|游戏|外卖|小说|漫画|书|玩具|盲盒/ },
];

/** 离线估算价值层级：优先用参考价，否则关键词词典，兜底 light */
export function estimateValueTier(
  text: string,
  referenceCny?: number,
): { tier: BountyValueTier; estimatedValueCny: number } {
  if (typeof referenceCny === "number" && referenceCny > 0) {
    return { tier: tierFromCny(referenceCny), estimatedValueCny: Math.round(referenceCny) };
  }
  for (const k of TIER_KEYWORDS) {
    if (k.words.test(text)) return { tier: k.tier, estimatedValueCny: k.cny };
  }
  return { tier: "light", estimatedValueCny: BOUNTY_HORIZON_BY_TIER.light.valueFloorCny + 100 };
}

const INDULGENT_RE = /奶茶|咖啡|游戏|零食|甜|烟|酒|赌|刷剧|外卖|盲盒/;

/** 两段中文是否共享一个 2-gram（高精度对齐启发，避免噪声）*/
function shareBigram(a: string, b: string): boolean {
  const norm = (s: string) => s.replace(/[\s，。、,.!?！？]/g, "");
  const x = norm(a);
  const y = norm(b);
  if (x.length < 2 || y.length < 2) return false;
  for (let i = 0; i < x.length - 1; i += 1) {
    if (y.includes(x.slice(i, i + 2))) return true;
  }
  return false;
}

/**
 * 离线对齐判定：命中红线 → conflict；与某活跃目标共享关键词 → aligned；
 * 享乐关键词 → indulgent；否则 neutral。在线时由经济官给出更细的判断。
 */
export function estimateAlignment(input: {
  text: string;
  goals: Array<{ id: string; title: string }>;
  redLines: string[];
}): { verdict: BountyAlignment; relatedGoalIds: string[]; redLineHit: boolean } {
  const redLineHit = input.redLines.some((r) => shareBigram(input.text, r));
  if (redLineHit) return { verdict: "conflict", relatedGoalIds: [], redLineHit: true };

  const related = input.goals.filter((g) => shareBigram(input.text, g.title));
  if (related.length > 0) {
    return { verdict: "aligned", relatedGoalIds: related.map((g) => g.id), redLineHit: false };
  }
  if (INDULGENT_RE.test(input.text)) {
    return { verdict: "indulgent", relatedGoalIds: [], redLineHit: false };
  }
  return { verdict: "neutral", relatedGoalIds: [], redLineHit: false };
}

// 顺序敏感：更具体的类别在前，先命中先返回。在线时由经济官给更准的判断。
const CATEGORY_KEYWORDS: ReadonlyArray<{ category: BountyCategory; words: RegExp }> = [
  { category: "electronics", words: /手机|电脑|笔记本|平板|ipad|iphone|耳机|耳麦|显示器|键盘|鼠标|相机|单反|游戏机|switch|ps5|显卡|手表|手环|音箱|充电|数码|电子|无人机/i },
  { category: "beauty", words: /美妆|护肤|化妆|香水|口红|面膜|个护|美容|美发|精华|彩妆/ },
  { category: "fitness", words: /健身|运动|跑步|球拍|瑜伽|健身卡|健身年卡|按摩|spa|蛋白粉|登山|游泳/i },
  { category: "travel", words: /旅行|旅游|出游|出国|度假|机票|酒店|民宿|露营|景区|门票|自驾/ },
  { category: "learning", words: /课程|网课|学习|培训|考试|证书|讲座|书籍|教材|知识/ },
  { category: "apparel", words: /衣服|裙|鞋|包包|帽|外套|裤|球鞋|名牌|穿搭|卫衣|t恤|大衣|背包/i },
  { category: "food", words: /奶茶|咖啡|美食|大餐|火锅|烧烤|零食|甜点|蛋糕|外卖|餐厅|饮料|巧克力|冰淇淋|可乐|小吃/ },
  { category: "entertainment", words: /游戏|电影|演唱会|话剧|演出|动漫|手办|乐高|盲盒|玩具|ktv|剧本杀|周边/i },
  { category: "home", words: /家具|家电|沙发|椅|床|厨|装饰|绿植|被|台灯|收纳|居家/ },
];

/** 离线语义分类：按"是什么"归类，兜底 other。在线时由经济官给出。*/
export function classifyCategory(text: string): BountyCategory {
  for (const c of CATEGORY_KEYWORDS) {
    if (c.words.test(text)) return c.category;
  }
  return "other";
}

// ── 节奏漂移再校准（商城子系统规划书 §7）─────────────────────────────

/** 中位数（用于"可持续赚取率"——抑制单周脉冲，要求节奏真的持续变化）*/
export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) return ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
  return sorted[mid] ?? 0;
}

export interface RecalibrationInput {
  /** 当前锁定价格 */
  currentPrice: number;
  /** 定价那一刻的赚取率（priceBreakdown.rWeek，可能为 0）*/
  rateAtPricing: number;
  /** 努力锚：目标兑现周期（priceBreakdown.impliedHorizonWeeks）*/
  targetHorizonWeeks: number;
  /** 当前可持续赚取率（近 4 周中位数，raw）*/
  currentRate: number;
  /** 宿主当前能量余额 */
  balance: number;
  /** 是否已锁价 */
  locked: boolean;
}

export interface RecalibrationResult {
  action: "none" | "lock" | "reprice";
  newPrice?: number;
  impliedHorizonWeeks?: number;
  direction?: "up" | "down";
}

/**
 * 纯函数：判断一条悬赏是否该再校准。
 * ①已锁/进度≥90%/已可兑换 → 锁定，绝不上调（临门一脚保护）。
 * ②赚取率漂移达 DRIFT_FACTOR（上或下）→ 按「同样努力（目标周期）×新节奏」重定价，再过护栏。
 * 努力中性：新价仍是约 targetHorizon 周——你赚得也变了，时间上不退步。
 */
export function evaluateRecalibration(input: RecalibrationInput): RecalibrationResult {
  if (input.locked) return { action: "none" };
  const progress = input.currentPrice > 0 ? input.balance / input.currentPrice : 1;
  if (progress >= BOUNTY_REPRICE_LOCK_PROGRESS) return { action: "lock" };
  if (input.targetHorizonWeeks <= 0) return { action: "none" };

  const effAt = effectiveRate(input.rateAtPricing);
  const effNow = effectiveRate(input.currentRate);
  const drift = effNow / effAt;
  // 滞回带：漂移不够大就不动价
  if (drift < BOUNTY_REPRICE_DRIFT_FACTOR && drift > 1 / BOUNTY_REPRICE_DRIFT_FACTOR) {
    return { action: "none" };
  }
  const clamped = clampToHorizon(effNow * input.targetHorizonWeeks, input.currentRate);
  if (clamped.price === input.currentPrice) return { action: "none" };
  return {
    action: "reprice",
    newPrice: clamped.price,
    impliedHorizonWeeks: clamped.impliedHorizonWeeks,
    direction: drift >= 1 ? "up" : "down",
  };
}
