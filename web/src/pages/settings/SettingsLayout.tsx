import {
  SettingsOutlined,
  KeyOutlined,
  MonitorHeartOutlined,
  ArrowOutward,
} from '@mui/icons-material';
import { Box, LinearProgress, Stack, Typography } from '@mui/material';
import { Outlet } from '@tanstack/react-router';
import { Suspense } from 'react';
import { RouterButtonLink } from '../../components/base/RouterButtonLink.tsx';
import { useSettings } from '../../store/settings/selectors.ts';

export function SettingsLayout() {
  const ar = useSettings().ui.i18n.locale === 'ar';
  const text = (a: string, b: string) => (ar ? a : b);
  return (
    <Stack spacing={3}>
      <Stack
        direction="row"
        gap={2}
        alignItems="center"
        sx={{ pb: 2.5, borderBottom: '1px solid', borderColor: 'divider' }}
      >
        <Box
          sx={{
            width: 48,
            height: 48,
            borderRadius: '12px',
            bgcolor: 'action.selected',
            color: 'primary.main',
            display: 'grid',
            placeItems: 'center',
          }}
        >
          <SettingsOutlined />
        </Box>
        <Box>
          <Typography
            sx={{
              color: 'primary.main',
              fontSize: 9,
              fontWeight: 800,
              letterSpacing: 2,
            }}
          >
            STUDIO CONFIGURATION
          </Typography>
          <Typography
            component="h1"
            sx={{ fontSize: 24, fontWeight: 800, mt: 0.5 }}
          >
            {text('إعدادات الاستوديو', 'Studio settings')}
          </Typography>
        </Box>
      </Stack>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: {
            xs: 'minmax(0,1fr)',
            xl: 'minmax(0,1fr) 220px',
          },
          gap: 3,
          alignItems: 'start',
        }}
      >
        <Box
          sx={{
            minWidth: 0,
            p: { xs: 2, md: 3 },
            border: '1px solid',
            borderColor: 'divider',
            borderRadius: '16px',
            bgcolor: 'background.paper',
          }}
        >
          <Suspense fallback={<LinearProgress />}>
            <Outlet />
          </Suspense>
        </Box>
        <Stack
          spacing={2}
          sx={{
            p: 2.5,
            border: '1px solid',
            borderColor: 'divider',
            borderRadius: '14px',
            bgcolor: 'background.paper',
          }}
        >
          <Typography sx={{ fontSize: 13, fontWeight: 800 }}>
            {text('أدوات الإدارة', 'Administration')}
          </Typography>
          <Typography
            sx={{ color: 'text.secondary', fontSize: 11, lineHeight: 1.9 }}
          >
            {text(
              'انتقل للحسابات والتفعيل أو راجع حالة السيرفر من هنا.',
              'Open account and activation controls or review the server status.',
            )}
          </Typography>
          <RouterButtonLink
            to="/settings/access"
            startIcon={<KeyOutlined />}
            sx={{ justifyContent: 'flex-start', fontSize: 11, px: 0 }}
          >
            {text('اليوزرات والليسانسات', 'Users and licenses')}
          </RouterButtonLink>
          <RouterButtonLink
            to="/system"
            startIcon={<MonitorHeartOutlined />}
            sx={{ justifyContent: 'flex-start', fontSize: 11, px: 0 }}
          >
            {text('مراقبة النظام', 'System monitor')}
          </RouterButtonLink>
          <RouterButtonLink
            to="/"
            endIcon={<ArrowOutward />}
            sx={{ justifyContent: 'flex-start', fontSize: 11, px: 0 }}
          >
            {text('العودة للاستوديو', 'Back to studio')}
          </RouterButtonLink>
        </Stack>
      </Box>
    </Stack>
  );
}
