import { createApp } from './app.js';
import { readConfig } from './config.js';
async function main() {
  const config = readConfig();
  const { app } = await createApp(config);
  app.enableShutdownHooks();
  await app.listen(config.API_PORT, config.API_HOST);
}
main().catch(error => {
  console.error(error instanceof Error && error.message.startsWith('Invalid environment') ? error.message : 'API startup failed. Check local configuration and port availability.');
  process.exitCode = 1;
});
