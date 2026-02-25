import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({
    origin: process.env.FRONTEND_ORIGIN ?? "http://localhost:3000",
    credentials: false
  });
  app.setGlobalPrefix("v1");
  await app.listen(process.env.PORT ? Number(process.env.PORT) : 3001);
}

bootstrap();
