import { Inject, Module, OnModuleInit } from "@nestjs/common";
import { AppController } from "./app.controller.js";
import { NexusService } from "./nexus.service.js";

@Module({
  controllers: [AppController],
  providers: [NexusService],
})
export class AppModule implements OnModuleInit {
  constructor(@Inject(NexusService) private readonly nexus: NexusService) {}

  async onModuleInit(): Promise<void> {
    await this.nexus.bootstrapVault();
  }
}
