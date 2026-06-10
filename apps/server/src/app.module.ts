import { Inject, Module, OnModuleInit } from "@nestjs/common";
import { ScheduleModule } from "@nestjs/schedule";
import { AppController } from "./app.controller.js";
import { NexusService } from "./nexus.service.js";
import { SchedulerService } from "./scheduler.service.js";

@Module({
  imports: [ScheduleModule.forRoot()],
  controllers: [AppController],
  providers: [NexusService, SchedulerService],
})
export class AppModule implements OnModuleInit {
  constructor(@Inject(NexusService) private readonly nexus: NexusService) {}

  async onModuleInit(): Promise<void> {
    await this.nexus.bootstrapVault();
  }
}
