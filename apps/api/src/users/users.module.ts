import { Module } from "@nestjs/common";
import { ConsentsModule } from "../consents/consents.module";
import { MeController } from "./me.controller";
import { OnboardingService } from "./onboarding.service";

@Module({
  imports: [ConsentsModule],
  controllers: [MeController],
  providers: [OnboardingService],
})
export class UsersModule {}
