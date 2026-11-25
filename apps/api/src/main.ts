import 'reflect-metadata';
import { loadConfig } from './config/config';
import { createApp } from './app.factory';

async function bootstrap() {
  const config = loadConfig();
  const app = await createApp();
  await app.listen(config.PORT);
  console.log(`Máy chủ Vạn Thuận ERP đang chạy ở cổng ${config.PORT}`);
}

void bootstrap();
