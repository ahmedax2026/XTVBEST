import { renderWithProviders, screen } from '@/test/utils';
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
import { expect, test, vi } from 'vitest';
import { XBestShell } from './XBestShell.tsx';
import type { ShellNav } from '../ui/patterns/AppShell/navModel.ts';
import useStore from '../../store/index.ts';
const nav: ShellNav = {
  sections: [
    {
      id: 'dashboard',
      label: 'لوحة الاستوديو',
      to: '/',
      icon: <span>X</span>,
      pages: [],
    },
  ],
  settings: {
    id: 'settings',
    label: 'الإعدادات',
    to: '/settings/general',
    icon: <span>S</span>,
    pages: [
      { id: 'access', label: 'اليوزرات والليسانسات', to: '/settings/access' },
    ],
  },
};
test('custom Arabic workspace has accessible mobile navigation and functional command search', async () => {
  useStore.setState((s) => {
    s.settings.ui.i18n.locale = 'ar';
  });
  const onOpenSearch = vi.fn();
  const router = createRouter({
    routeTree: createRootRoute({
      component: () => (
        <XBestShell
          nav={nav}
          active={{ sectionId: 'dashboard' }}
          isDark
          onToggleColorScheme={() => {}}
          onOpenSearch={onOpenSearch}
          searchShortcut="Ctrl K"
        >
          <h1>محتوى الاستوديو</h1>
        </XBestShell>
      ),
    }),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  });
  const { user } = renderWithProviders(<RouterProvider router={router} />);
  await screen.findByRole('heading', { name: 'محتوى الاستوديو' });
  expect(screen.getByRole('main')).toHaveAttribute('id', 'studio-content');
  expect(screen.queryByText(/Tunarr/i)).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'البحث والأوامر' }));
  expect(onOpenSearch).toHaveBeenCalledOnce();
  await user.click(screen.getByRole('button', { name: 'فتح القائمة' }));
  expect(
    await screen.findByRole('navigation', { name: 'التنقل الرئيسي' }),
  ).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'إغلاق القائمة' }));
});
