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
const html = path.join(root, 'monitor-smoke.html');
const source = path.join(root, 'src/monitor-smoke.tsx');
const output = path.join(root, 'test-results/live-monitor');
const id = '00000000-0000-4000-8000-000000000099';
const entry = `
import { createRoot } from 'react-dom/client';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider, CssBaseline } from '@mui/material';
import { SnackbarProvider } from 'notistack';
import { Theme } from './theme.ts';
import { messages } from './locales/ar/messages.po';
import { ChannelSessionsDialog } from './components/channels/ChannelSessionsDialog.tsx';
import { ChannelArchiveDialog } from './components/channels/ChannelArchiveDialog.tsx';
import { makeStoryChannel } from './components/channels/channelStoryFixtures.ts';
i18n.loadAndActivate({ locale: 'ar', messages });
const root = document.getElementById('root');
if (!root) throw new Error('Missing preview root');
createRoot(root).render(<I18nProvider i18n={i18n}><ThemeProvider theme={{...Theme,direction:'rtl'}} defaultMode="dark"><CssBaseline/><QueryClientProvider client={new QueryClient()}><SnackbarProvider>{location.search.includes('archive') ? <ChannelArchiveDialog open onClose={()=>{}} channel={makeStoryChannel({id:'${id}',name:'إكس بيست أفلام'})}/> : <ChannelSessionsDialog open onClose={()=>{}} channel={makeStoryChannel({id:'${id}',name:'إكس بيست أفلام'})}/>}</SnackbarProvider></QueryClientProvider></ThemeProvider></I18nProvider>);
`;
let server;
let browser;
try {
  await fs.mkdir(output, { recursive: true });
  await fs.writeFile(
    html,
    '<!doctype html><html lang="ar" dir="rtl"><meta charset="UTF-8"/><body><div id="root"></div><script type="module" src="/src/monitor-smoke.tsx"></script></body></html>',
  );
  await fs.writeFile(source, entry);
  server = spawn(
    'pnpm',
    ['exec', 'vite', '--host', '127.0.0.1', '--port', '5174', '--strictPort'],
    { cwd: root, stdio: 'inherit', detached: true },
  );
  const url = 'http://127.0.0.1:5174/web/monitor-smoke.html';
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      ready = (await fetch(url)).ok;
    } catch {
      /* server is starting */
    }
    if (ready) break;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  assert(ready, 'Preview server did not start');
  browser = await chromium.launch({
    headless: true,
    ...(process.env.XBEST_CHROMIUM_PATH
      ? { executablePath: process.env.XBEST_CHROMIUM_PATH }
      : {}),
  });
  const page = await browser.newPage({
    viewport: { width: 1000, height: 1000 },
  });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  let sessions = [
    {
      type: 'hls',
      state: 'started',
      numConnections: 2,
      connections: [
        {
          ip: '192.0.2.12',
          userAgent: 'VLC media player',
          lastHeartbeat: Date.now(),
        },
      ],
    },
  ];
  await page.route('**/api/sessions', (route) =>
    route.fulfill({
      contentType: 'application/json',
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'content-type',
      },
      body: JSON.stringify({ [id]: sessions }),
    }),
  );
  await page.route(`**/api/channels/${id}/sessions`, (route) => {
    if (route.request().method() === 'OPTIONS')
      return route.fulfill({
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'content-type',
        },
      });
    sessions = [];
    return route.fulfill({
      status: 201,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'content-type',
      },
    });
  });
  await page.goto(url);
  await page.getByText('192.0.2.12').waitFor();
  await page.locator('.MuiDialog-root').evaluate(async (element) => {
    const finite = element
      .getAnimations({ subtree: true })
      .filter(
        (animation) => animation.effect?.getTiming().iterations !== Infinity,
      );
    await Promise.all(
      finite.map((animation) => animation.finished.catch(() => {})),
    );
  });
  assert(
    (await page.getByLabel('رابط HLS الثابت').inputValue()).endsWith(
      `/stream/channels/${id}.m3u8`,
    ),
  );
  await page.screenshot({
    path: path.join(output, 'desktop.png'),
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    'Page overflows mobile viewport',
  );
  assert(
    await page
      .locator('.MuiDialog-paper')
      .evaluate((element) => element.scrollWidth <= element.clientWidth),
    'Dialog overflows mobile viewport',
  );
  await page.screenshot({
    path: path.join(output, 'mobile.png'),
    fullPage: true,
  });
  await page
    .getByRole('button', { name: 'إيقاف الجلسات', exact: true })
    .click();
  await page.getByText('لا توجد جلسات نشطة لهذه القناة.').waitFor();
  let archiveState = 'ready';
  await page.route(`**/api/channels/${id}/archive**`, async (route) => {
    const headers = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'content-type',
    };
    if (route.request().method() === 'OPTIONS')
      return route.fulfill({ status: 204, headers });
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON();
      assert.equal(body.mode, 'archive');
      archiveState = 'pending';
    }
    return route.fulfill({
      contentType: 'application/json',
      headers,
      body: JSON.stringify({
        state: archiveState,
        total: 3,
        completed: 3,
        bytes: 1024 ** 3,
      }),
    });
  });
  await page.goto(url + '?archive');
  await page.getByText('القناة المحفوظة جاهزة', { exact: true }).waitFor();
  assert(
    await page
      .locator('.MuiDialog-paper')
      .evaluate((element) => element.scrollWidth <= element.clientWidth),
    'Archive dialog overflows mobile viewport',
  );
  await page.screenshot({
    path: path.join(output, 'archive-mobile.png'),
    fullPage: true,
  });
  await page.setViewportSize({ width: 1000, height: 1000 });
  await page.screenshot({
    path: path.join(output, 'archive-desktop.png'),
    fullPage: true,
  });
  await page
    .getByRole('button', { name: 'التحويل للقناة المحفوظة', exact: true })
    .click();
  await page
    .getByText('التحويل مع بداية الفيلم التالي', { exact: true })
    .waitFor();
  assert.deepEqual(errors, [], 'Browser raised runtime errors');
  console.log(
    'Arabic desktop/mobile monitor and archive controls, stable link and actions passed',
  );
} finally {
  await browser?.close();
  if (server?.pid) {
    try {
      process.kill(-server.pid, 'SIGTERM');
    } catch {
      /* process already exited */
    }
  }
  await Promise.all([
    fs.rm(html, { force: true }),
    fs.rm(source, { force: true }),
  ]);
}
