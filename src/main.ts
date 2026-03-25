import { Logger, ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { getRuntimeEnv } from "./shared/infrastructure/config/load-env";
import { AppErrorFilter } from "./shared/presentation/app-error.filter";
import { AppModule } from "./app.module";

const env = getRuntimeEnv();
const logger = new Logger("Bootstrap");

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true }
    })
  );
  app.useGlobalFilters(new AppErrorFilter());
  app.enableCors({
    origin: env.FRONTEND_ORIGIN,
    credentials: false
  });
  app.setGlobalPrefix("v1");
  await app.listen(env.PORT);
  logger.log(JSON.stringify({
    event: "app_bootstrap_complete",
    service: "telita-back",
    port: env.PORT,
    globalPrefix: "v1",
    frontendOrigin: env.FRONTEND_ORIGIN
  }));
}

bootstrap();
