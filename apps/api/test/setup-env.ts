import { Logger } from "@nestjs/common";
import { loadEnvFile } from "../src/config/env";

// Local defaults point at infra/docker-compose.yml; CI sets DATABASE_URL/REDIS_URL, which take precedence.
loadEnvFile(".env.test");

// Failure-path tests trigger expected warnings; keep test output to real errors.
Logger.overrideLogger(["error", "fatal"]);
