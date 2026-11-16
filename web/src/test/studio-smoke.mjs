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
const html = path.join(root, 'studio-preview.html');
const entry = path.join(root, 'src/studio-preview.tsx');
const output = path.join(root, 'test-results/studio');
const port = Number(process.env.XBEST_PREVIEW_PORT ?? '35455');
const source = `
import {createRoot} from 'react-dom/client';
import {createRootRoute,createRouter,createMemoryHistory,RouterProvider} from '@tanstack/react-router';
import {ThemeProvider,CssBaseline,createTheme} from '@mui/material';
import {i18n} from '@lingui/core';
import {I18nProvider} from '@lingui/react';
import {Theme} from './theme.ts';
import {XBestShell} from './components/shell/XBestShell.tsx';
import {StudioDashboardView} from './pages/studio/StudioDashboard.tsx';
import {makeStoryChannel} from './components/channels/channelStoryFixtures.ts';
import {useSettings} from './store/settings/selectors.ts';
import useStore from './store/index.ts';
const lang=new URLSearchParams(location.search).get('lang')==='en'?'en':'ar';
useStore.setState(s=>{s.settings.ui.i18n.locale=lang});
i18n.loadAndActivate({locale:lang,messages:{}});
document.documentElement.lang=lang;document.documentElement.dir=lang==='ar'?'rtl':'ltr';
function Workspace(){const ar=useSettings().ui.i18n.locale==='ar';const label=(a,b)=>ar?a:b;
const nav={sections:[{id:'dashboard',label:label('لوحة الاستوديو','Studio overview'),to:'/',icon:'◈',pages:[]},{id:'channels',label:label('القنوات','Channels'),to:'/channels',icon:'▣',pages:[]},{id:'guide',label:label('دليل البث','Program guide'),to:'/guide',icon:'▤',pages:[]},{id:'library',label:label('مكتبة المحتوى','Content library'),to:'/library/media',icon:'▥',pages:[]}],settings:{id:'settings',label:label('الإعدادات','Settings'),to:'/settings/general',icon:'⚙',pages:[]}};
const channels=[makeStoryChannel({id:'cinema',name:label('إكس بيست سينما','XBest Cinema'),number:1,programCount:24,sessions:[]}),makeStoryChannel({id:'drama',name:label('إكس بيست دراما','XBest Drama'),number:2,programCount:48,sessions:[]}),makeStoryChannel({id:'family',name:label('إكس بيست العائلة','XBest Family'),number:3,programCount:18,sessions:[]})];
const nowPlaying=new Map([['cinema',{kind:'content',title:label('ليلة في الاستوديو','A night in the studio'),progress:.43}],['drama',{kind:'content',title:label('حكايات المدينة','City stories'),progress:.62}]]);
return <ThemeProvider theme={createTheme(Theme,{direction:ar?'rtl':'ltr'})} defaultMode="dark"><CssBaseline/><XBestShell nav={nav} active={{sectionId:'dashboard'}} isDark onToggleColorScheme={()=>{}} onOpenSearch={()=>{}} searchShortcut="Ctrl K"><StudioDashboardView channels={channels} nowPlaying={nowPlaying} loading={false} error={false} refreshing={false} onRefresh={()=>{}}/></XBestShell></ThemeProvider>}
const router=createRouter({routeTree:createRootRoute({component:Workspace}),history:createMemoryHistory({initialEntries:['/']})});
createRoot(document.getElementById('root')).render(<I18nProvider i18n={i18n}><RouterProvider router={router}/></I18nProvider>);
`;
let server, browser;
try {
  await fs.mkdir(output, { recursive: true });
  await fs.writeFile(
    html,
    '<!doctype html><html><meta charset="UTF-8"/><body><div id="root"></div><script type="module" src="/src/studio-preview.tsx"></script></body></html>',
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
  const url = `http://127.0.0.1:${port}/web/studio-preview.html`;
  let ready = false;
  for (let n = 0; n < 60; n++) {
    try {
      ready = (await fetch(url)).ok;
    } catch {}
    if (ready) break;
    await new Promise((r) => setTimeout(r, 500));
  }
  assert(ready, 'Studio preview server did not start');
  browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
    ...(process.env.XBEST_CHROMIUM_PATH
      ? { executablePath: process.env.XBEST_CHROMIUM_PATH }
      : {}),
  });
  const errors = [];
  const page = await browser.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  for (const lang of ['ar', 'en']) {
    await page.setViewportSize({ width: 1536, height: 1000 });
    await page.goto(`${url}?lang=${lang}`);
    await page
      .getByRole('heading', {
        name:
          lang === 'ar'
            ? 'قنواتك. بثّك. تحكّمك.'
            : 'Your channels. Your control.',
      })
      .waitFor();
    await page.screenshot({
      path: path.join(output, `studio-${lang}-desktop.png`),
      fullPage: true,
    });
    assert(
      !/Tunarr/i.test(await page.locator('body').innerText()),
      'Old product name leaked',
    );
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
      'Desktop horizontal overflow',
    );
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: path.join(output, `studio-${lang}-mobile.png`),
      fullPage: true,
    });
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
      'Mobile horizontal overflow',
    );
    await page
      .getByRole('button', {
        name: lang === 'ar' ? 'فتح القائمة' : 'Open navigation',
      })
      .click();
    await page.getByRole('navigation').waitFor();
    await page.screenshot({
      path: path.join(output, `studio-${lang}-navigation.png`),
      fullPage: true,
    });
    await page
      .getByRole('button', {
        name: lang === 'ar' ? 'إغلاق القائمة' : 'Close navigation',
      })
      .click();
  }
  for (const lang of ['ar', 'en']) {
    const snapshot = path.join(output, `login-${lang}.html`);
    await fs.access(snapshot);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(
      `http://127.0.0.1:${port}/web/test-results/studio/login-${lang}.html`,
    );
    await page
      .getByRole('heading', {
        name: lang === 'ar' ? 'أهلًا بعودتك' : 'Welcome back',
      })
      .waitFor();
    await page.screenshot({
      path: path.join(output, `login-${lang}-desktop.png`),
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: path.join(output, `login-${lang}-mobile.png`),
      fullPage: true,
    });
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
      'Login horizontal overflow',
    );
    assert(
      !/Tunarr/i.test(await page.locator('body').innerText()),
      'Login branding leaked',
    );
  }
  assert.deepEqual(errors, []);
  console.log('Studio desktop/mobile Arabic/English checks passed');
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
