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
}
