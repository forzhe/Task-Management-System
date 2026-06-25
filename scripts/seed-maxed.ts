/**
 * 满级测试账号种子脚本（使用过程的问题.md #13）。
 *
 * 把本地账号灌到满级：Lv.60（≥Lv.50 即解锁全部模块）、六维拉满、
 * 可信度与能量点拉高，并把档案标记为已 onboarded，方便直接进主界面测试。
 *
 * 用法：corepack pnpm seed:maxed   （后端需先至少启动过一次以生成数据库）
 * 仅改本地数据，可重复运行。
 */
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

const userId = process.env.NEXUS_USER_ID ?? "local-host";
const dbPathEnv = process.env.NEXUS_DB_PATH ?? "./nexus-7.db";

// 后端 dev:server 的工作目录在 apps/server，DB 默认就落在那；脚本在仓库根运行，
// 因此优先找 apps/server 下，再回退到根目录。
const candidates = [
  resolve(process.cwd(), "apps/server", dbPathEnv),
  resolve(process.cwd(), dbPathEnv),
];
const dbPath = candidates.find((p) => existsSync(p));

if (!dbPath) {
  console.error("✗ 找不到数据库。请先启动一次后端（corepack pnpm dev:server）生成数据库，再运行本脚本。");
  console.error("  已查找：\n    " + candidates.join("\n    "));
  process.exit(1);
}

const LEVEL = 60;
const TOTAL_EXP = LEVEL * LEVEL * 100; // calcLevel = floor(sqrt(totalExp/100)) = 60
const MAX_ATTR = 9999;
const attributes = {
  intellect: MAX_ATTR,
  stamina: MAX_ATTR,
  focus: MAX_ATTR,
  willpower: MAX_ATTR,
  creativity: MAX_ATTR,
  order: MAX_ATTR,
};

const db = new DatabaseSync(dbPath);

const userResult = db
  .prepare(
    `update users
       set current_level = ?, total_exp = ?, credibility_score = ?, energy_points = ?, attributes_json = ?
     where id = ?`,
  )
  .run(LEVEL, TOTAL_EXP, 2, 99999, JSON.stringify(attributes), userId);

if (userResult.changes === 0) {
  console.error(`✗ users 表里没有 id=${userId} 的行。请先启动一次后端生成账号，再运行本脚本。`);
  db.close();
  process.exit(1);
}

// 顺手把档案标记为已 onboarded，测试号直接进主界面（保留其余档案内容）。
const profileRow = db
  .prepare(`select basic_info_json from profiles where user_id = ?`)
  .get(userId) as { basic_info_json?: string } | undefined;
if (profileRow?.basic_info_json) {
  let basic: Record<string, unknown> = {};
  try {
    basic = JSON.parse(profileRow.basic_info_json) as Record<string, unknown>;
  } catch {
    basic = {};
  }
  basic.onboarded = true;
  db.prepare(`update profiles set basic_info_json = ? where user_id = ?`).run(
    JSON.stringify(basic),
    userId,
  );
}

db.close();

console.log(`✓ 满级测试账号已就绪 @ ${dbPath}`);
console.log(`  等级 Lv.${LEVEL} · 经验 ${TOTAL_EXP} · 六维 ${MAX_ATTR} · 可信度 2.0 · 能量点 99999`);
console.log("  刷新桌面端即可看到全部模块解锁、等级拉满。");
