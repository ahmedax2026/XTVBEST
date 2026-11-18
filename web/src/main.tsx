import { isAxiosError } from 'axios';
import { client } from './generated/client.gen.ts';
import languages from '@cospired/i18n-iso-languages';
import en from '@cospired/i18n-iso-languages/langs/en.json';
import '@fontsource-variable/ibm-plex-sans';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import '@fontsource/ibm-plex-mono/600.css';
import { ColorSpace, LCH, OKLCH, sRGB } from 'colorjs.io/fn';
import dayjs from 'dayjs';
import localeData from 'dayjs/plugin/localeData';
import localizedFormat from 'dayjs/plugin/localizedFormat';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { XBestApp } from './XBestApp.tsx';
import './helpers/dayjs.ts';
import './index.css';

ColorSpace.register(OKLCH);
ColorSpace.register(LCH);
ColorSpace.register(sRGB);

dayjs.extend(localizedFormat);
dayjs.extend(localeData);

// Initialize the languages database with English names
// TODO: localize this and make it a context provider
languages.registerLocale(en);

client.instance.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    if (
      isAxiosError<{ loginUrl?: unknown }>(error) &&
      error.response?.status === 401 &&
      error.response.data?.loginUrl === '/web/'
    ) {
      window.location.reload();
    }
    throw error instanceof Error ? error : new Error('API request failed');
  },
);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <XBestApp />
  </React.StrictMode>,
);
