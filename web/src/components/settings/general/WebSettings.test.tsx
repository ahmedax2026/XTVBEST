import { renderWithProviders, screen } from '@/test/utils';
import { expect, test } from 'vitest';
import { WebSettings } from './WebSettings.tsx';

test('shows only Arabic and English in the language selector, including development builds', async () => {
  const { user } = renderWithProviders(<WebSettings />);
  await user.click(screen.getByRole('combobox', { name: 'Language' }));
  expect(
    screen.getAllByRole('option').map((option) => option.textContent),
  ).toEqual(['العربية', 'English']);
});
