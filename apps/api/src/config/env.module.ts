import { type DynamicModule, Module } from "@nestjs/common";
import type { Env } from "./env";

export const ENV = Symbol("ENV");

/** Provides the validated environment under the `ENV` token to every module. */
@Module({})
export class EnvModule {
  static forRoot(env: Env): DynamicModule {
    return {
      module: EnvModule,
      global: true,
      providers: [{ provide: ENV, useValue: env }],
      exports: [ENV],
    };
  }
}
