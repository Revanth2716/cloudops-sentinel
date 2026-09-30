import { buildApp } from './app.js';
import { config } from '@cloudops/config';
const app = buildApp();
const shutdown = async () => { await app.close(); };
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
app.listen({ port: config.port, host: '127.0.0.1' }).then(() => console.log(JSON.stringify({ event: 'api_started', port: config.port }))).catch((error) => { console.error(JSON.stringify({ event: 'api_start_failed', message: error instanceof Error ? error.message : 'unknown error' })); process.exitCode = 1; });
