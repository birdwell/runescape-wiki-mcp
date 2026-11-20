import { defineConfig } from '@playwright/test';

const port = 8099;
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
    testDir: './e2e',
    timeout: 20_000,
    retries: 0,
    use: { baseURL },
    webServer: {
        command: `env -i PATH="$PATH" HOME="$HOME" NODE_ENV=test PORT=${port} HOST=127.0.0.1 node dist/http.js`,
        url: `${baseURL}/health`,
        reuseExistingServer: false,
        timeout: 20_000,
    },
});
