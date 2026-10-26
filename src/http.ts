// Node HTTP entry for the public server or the isolated protected beta.
import './instrument.js';
import { configureBeta } from './beta.js';
import { createHttpServer } from './httpApp.js';

const port = Number(process.env.PORT ?? 8080);
const host = process.env.HOST ?? '0.0.0.0';
const app = createHttpServer(configureBeta(), port);
app.server.listen(port, host, () => {
    console.error(`RuneScape 3 MCP Server listening on http://${host}:${port}/mcp`);
});
async function shutdown(): Promise<void> {
    await app.close();
    process.exit(0);
}
process.on('SIGINT', () => { void shutdown(); });
process.on('SIGTERM', () => { void shutdown(); });
