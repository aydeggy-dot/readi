import type { INestApplication } from "@nestjs/common";
import { DocumentBuilder, type OpenAPIObject, SwaggerModule } from "@nestjs/swagger";
import { cleanupOpenApiDoc } from "nestjs-zod";

/** OpenAPI document generated from the Zod DTOs (ADR-0003); source for packages/api-client later. */
export function createOpenApiDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder().setTitle("Readi API").setVersion("0.0.0").build();
  return cleanupOpenApiDoc(SwaggerModule.createDocument(app, config));
}
