import { createFileRoute } from '@tanstack/react-router';
import AccessSettingsPage from '../../pages/settings/AccessSettingsPage.tsx';
export const Route = createFileRoute('/settings/access')({
  component: AccessSettingsPage,
});
