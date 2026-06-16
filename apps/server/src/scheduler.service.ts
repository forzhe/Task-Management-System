import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { NexusService } from "./nexus.service.js";

@Injectable()
export class SchedulerService {
  private readonly logger = new Logger(SchedulerService.name);

  constructor(private readonly nexus: NexusService) {}

  /** 每天 08:00 检查提醒 */
  @Cron("0 8 * * *", { name: "morning-reminder" })
  async morningReminderCheck() {
    this.logger.log("晨间提醒检查启动");
    try {
      const result = await this.nexus.runReminderCheck();
      if (result.response) {
        this.logger.log(`提醒已生成：${result.response}`);
      }
    } catch (err) {
      this.logger.error("晨间提醒检查失败", err);
    }
  }

  /** 每天 20:00 再次检查提醒（夜间） */
  @Cron("0 20 * * *", { name: "evening-reminder" })
  async eveningReminderCheck() {
    this.logger.log("晚间提醒检查启动");
    try {
      const result = await this.nexus.runReminderCheck();
      if (result.response) {
        this.logger.log(`提醒已生成：${result.response}`);
      }
    } catch (err) {
      this.logger.error("晚间提醒检查失败", err);
    }
  }

  /** 每周一 09:00 生成洞察报告 */
  @Cron("0 9 * * 1", { name: "weekly-insight" })
  async weeklyInsightGenerate() {
    this.logger.log("每周洞察报告生成启动");
    try {
      await this.nexus.runWeeklyInsight();
      this.logger.log("每周洞察报告已生成");
    } catch (err) {
      this.logger.error("每周洞察报告生成失败", err);
    }
  }

  /** 每天 21:00 触发晨间规划提醒（如尚未规划） */
  @Cron(CronExpression.EVERY_DAY_AT_9PM, { name: "plan-nudge" })
  async planNudgeCheck() {
    this.logger.log("规划提醒检查（21:00）");
  }

  /** §6.6.1：每天 00:05 习惯链日界结算（断链分析 + 低谷检测） */
  @Cron("5 0 * * *", { name: "streak-settle" })
  async streakSettle() {
    this.logger.log("习惯链日界结算启动");
    try {
      const result = await this.nexus.settleDailyStreaks();
      this.logger.log(`结算完成，断链 ${result.brokenCount} 条`);
    } catch (err) {
      this.logger.error("习惯链结算失败", err);
    }
  }

  /** §6.6.4：每小时第 10 分钟关键时刻介入检查（信号内部按时段门控） */
  @Cron("10 * * * *", { name: "intervention-check" })
  async interventionCheck() {
    try {
      const result = await this.nexus.runInterventionCheck();
      if (result.fired.length > 0) {
        this.logger.log(`介入已触发：${result.fired.join(", ")}`);
      }
    } catch (err) {
      this.logger.error("介入检查失败", err);
    }
  }

  /** §8.1：每天 00:10 属性衰减结算 */
  @Cron("10 0 * * *", { name: "attribute-decay" })
  async attributeDecay() {
    this.logger.log("属性衰减结算启动");
    try {
      const result = this.nexus.applyAttributeDecay();
      if (result.decayed.length > 0) {
        this.logger.log(`衰减 ${result.decayed.length} 个维度，关怀 ${result.needsCare.length} 个`);
      }
    } catch (err) {
      this.logger.error("属性衰减结算失败", err);
    }
  }

  /** §5.3：每周一 09:30 档案演化扫描（在周洞察之后） */
  @Cron("30 9 * * 1", { name: "profile-evolution" })
  async profileEvolution() {
    this.logger.log("档案演化扫描启动");
    try {
      const result = await this.nexus.runProfileEvolution(false);
      this.logger.log(`档案扫描完成：${result.response ?? ""}`);
    } catch (err) {
      this.logger.error("档案演化扫描失败", err);
    }
  }

  /** §5.3：每月 1 号 10:00 深度人格扫描（opus） */
  @Cron("0 10 1 * *", { name: "profile-deep-scan" })
  async profileDeepScan() {
    this.logger.log("月度深度人格扫描启动");
    try {
      await this.nexus.runProfileEvolution(true);
    } catch (err) {
      this.logger.error("月度深度扫描失败", err);
    }
  }

  /** §9：每周日 20:00 生成周报 */
  @Cron("0 20 * * 0", { name: "weekly-report" })
  async weeklyReport() {
    this.logger.log("周报生成启动");
    try {
      const report = await this.nexus.runWeeklyReport();
      this.logger.log(`周报已生成：${report.narrative.headline}`);
    } catch (err) {
      this.logger.error("周报生成失败", err);
    }
  }

  /** §9：每月 1 号 10:30 生成月报（在深度人格扫描之后） */
  @Cron("30 10 1 * *", { name: "monthly-report" })
  async monthlyReport() {
    this.logger.log("月报生成启动");
    try {
      const report = await this.nexus.runMonthlyReport();
      this.logger.log(`月报已生成：${report.narrative.headline}`);
    } catch (err) {
      this.logger.error("月报生成失败", err);
    }
  }

  /** §9 / P3-9：每季度首月 1 号 11:00 生成季度报告（多源长期趋势） */
  @Cron("0 11 1 1,4,7,10 *", { name: "quarterly-report" })
  async quarterlyReport() {
    this.logger.log("季度报告生成启动");
    try {
      const report = await this.nexus.runQuarterlyReport();
      this.logger.log(`季度报告已生成：${report.narrative.headline}`);
    } catch (err) {
      this.logger.error("季度报告生成失败", err);
    }
  }

  /** §9 / P3-9：每年 1 月 1 号 11:30 生成年度报告 */
  @Cron("30 11 1 1 *", { name: "annual-report" })
  async annualReport() {
    this.logger.log("年度报告生成启动");
    try {
      const report = await this.nexus.runAnnualReport();
      this.logger.log(`年度报告已生成：${report.narrative.headline}`);
    } catch (err) {
      this.logger.error("年度报告生成失败", err);
    }
  }

  /** §6.7.3：每天 19:30 守护巡查（属性荒废时辅助 Agent 主动发声，无信号则安静） */
  @Cron("30 19 * * *", { name: "steward-sweep" })
  async stewardSweep() {
    try {
      const result = await this.nexus.runStewardSweep(false);
      if (!result.skipped && result.companionLine) {
        this.logger.log(`守护巡查发声（${result.domains.join("+")}）：${result.companionLine}`);
      }
    } catch (err) {
      this.logger.error("守护巡查失败", err);
    }
  }

  /** §5.2：每天 03:00 记忆收紧（聚合琐碎旧事件，保护重要记忆） */
  @Cron("0 3 * * *", { name: "memory-compaction" })
  async memoryCompaction() {
    this.logger.log("记忆收紧启动");
    try {
      const result = this.nexus.compactMemory();
      if (result.compacted > 0) {
        this.logger.log(`聚合 ${result.compacted} 条事件为 ${result.digests} 条摘要`);
      }
    } catch (err) {
      this.logger.error("记忆收紧失败", err);
    }
  }
}
