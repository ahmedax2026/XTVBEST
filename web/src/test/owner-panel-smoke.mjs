import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);
const html = path.join(root, 'owner-preview.html');
const entry = path.join(root, 'src/owner-preview.tsx');
const output = path.join(root, 'test-results/owner');
const port = Number(process.env.XBEST_OWNER_PREVIEW_PORT ?? '35457');
const source = `
import {createRoot} from 'react-dom/client';
import {ThemeProvider,CssBaseline,createTheme} from '@mui/material';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {Theme} from './theme.ts';
import AccessSettingsPage from './pages/settings/AccessSettingsPage.tsx';
import useStore from './store/index.ts';
import {client} from './generated/client.gen.ts';
const lang=new URLSearchParams(location.search).get('lang')==='en'?'en':'ar';
useStore.setState(s=>{s.settings.ui.i18n.locale=lang});
client.instance.defaults.baseURL=location.origin;
document.documentElement.lang=lang;document.documentElement.dir=lang==='ar'?'rtl':'ltr';
createRoot(document.getElementById('root')).render(<ThemeProvider theme={createTheme(Theme,{direction:lang==='ar'?'rtl':'ltr'})} defaultMode="dark"><CssBaseline/><QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><main style={{maxWidth:1280,margin:'auto',padding:24}}><AccessSettingsPage/></main></QueryClientProvider></ThemeProvider>);
`;
let server, browser;
try {
  await fs.mkdir(output, { recursive: true });
  await fs.writeFile(
    html,
    '<!doctype html><html><meta charset="UTF-8"/><body><div id="root"></div><script type="module" src="/src/owner-preview.tsx"></script></body></html>',
  );
  await fs.writeFile(entry, source);
  server = spawn(
    'pnpm',
    [
      'exec',
      'vite',
      '--host',
      '127.0.0.1',
      '--port',
      String(port),
      '--strictPort',
    ],
    { cwd: root, stdio: 'inherit', detached: true },
  );
  const url = `http://127.0.0.1:${port}/web/owner-preview.html`;
  let ready = false;
  for (let n = 0; n < 60; n++) {
    try {
      ready = (await fetch(url)).ok;
    } catch {}
    if (ready) break;
    await new Promise((r) => setTimeout(r, 500));
  }
  assert(ready, 'Owner preview server did not start');
  browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
    ...(process.env.XBEST_CHROMIUM_PATH
      ? { executablePath: process.env.XBEST_CHROMIUM_PATH }
      : {}),
  });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const installation = 'b'.repeat(64);
  await page.route('**/api/access/**', async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    const data = pathname.endsWith('/status')
      ? {
          owner: true,
          issuer: true,
          configured: true,
          required: false,
          valid: true,
          installation: 'a'.repeat(64),
        }
      : pathname.endsWith('/users')
        ? [{ username: 'customer@example.com', enabled: true, installation }]
        : pathname.endsWith('/licenses')
          ? [
              {
                enabled: true,
                payload: {
                  id: 'a661e511-e6df-46c3-907d-47955f17dc5e',
                  customer: 'XBEST Cinema',
                  installation,
                  expiresAt: new Date(Date.now() + 3 * 86400000).toISOString(),
                  validation: 'online',
                },
              },
            ]
          : pathname.endsWith('/public-key')
            ? { publicKey: 'PUBLIC KEY PREVIEW' }
            : [];
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(data),
    });
  });
  for (const lang of ['ar', 'en']) {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(`${url}?lang=${lang}`);
    await page
      .getByRole('heading', {
        name: lang === 'ar' ? 'لوحة الأونر' : 'Owner control panel',
      })
      .waitFor();
    await page
      .getByText('customer@example.com', { exact: false })
      .first()
      .waitFor();
    await page.screenshot({
      path: path.join(output, `owner-${lang}-desktop.png`),
      fullPage: true,
    });
    await page
      .getByRole('tab', {
        name: lang === 'ar' ? 'العملاء والليسانسات' : 'Customers and licenses',
        exact: true,
      })
      .click();
    await page
      .getByRole('button', {
        name: lang === 'ar' ? 'إصدار ليسانس' : 'Issue license',
        exact: true,
      })
      .waitFor();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: path.join(output, `owner-${lang}-mobile.png`),
      fullPage: true,
    });
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
      'Owner panel horizontal overflow',
    );
    assert(
      !/Tunarr/i.test(await page.locator('body').innerText()),
      'Owner panel legacy branding',
    );
  }
  assert.deepEqual(errors, []);
  console.log(
    'Owner panel Arabic/English desktop/mobile browser acceptance passed',
  );
} finally {
  await browser?.close();
  if (server?.pid) {
    try {
      process.kill(-server.pid, 'SIGTERM');
    } catch {}
  }
  await Promise.all([
    fs.rm(html, { force: true }),
    fs.rm(entry, { force: true }),
  ]);
}
