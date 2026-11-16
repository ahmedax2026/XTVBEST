import {
  DarkModeOutlined,
  LightModeOutlined,
  Menu,
  Search,
  Close,
  Logout,
  ArrowOutward,
} from '@mui/icons-material';
import {
  Box,
  Alert,
  Button,
  Divider,
  Drawer,
  IconButton,
  Stack,
  Typography,
  alpha,
} from '@mui/material';
import { useState } from 'react';
import type { ReactNode } from 'react';
import { RouterButtonLink } from '../base/RouterButtonLink.tsx';
import type { ActiveNav, ShellNav } from '../ui/patterns/AppShell/navModel.ts';
import { useSettings } from '../../store/settings/selectors.ts';
import { setUiLocale } from '../../store/settings/actions.ts';

type Props = {
  nav: ShellNav;
  active: ActiveNav;
  isDark: boolean;
  onToggleColorScheme: () => void;
  onOpenSearch: () => void;
  searchShortcut: string;
  children?: ReactNode;
};

/** XBest's responsive studio workspace. Route data is shared with the command
 * palette; none of the previous top/bottom navigation chrome is rendered. */
export function XBestShell({
  nav,
  active,
  isDark,
  onToggleColorScheme,
  onOpenSearch,
  searchShortcut,
  children,
}: Props) {
  const ar = useSettings().ui.i18n.locale === 'ar';
  const text = (arabic: string, english: string) => (ar ? arabic : english);
  const [open, setOpen] = useState(false);
  const [localeBusy, setLocaleBusy] = useState(false);
  const [logoutError, setLogoutError] = useState(false);
  const sections = [...nav.sections.filter((s) => !s.hidden), nav.settings];
  const section = sections.find((s) => s.id === active.sectionId);
  const page = section?.pages.find((p) => p.id === active.pageId);
  const brand = (
    <Stack
      direction="row"
      spacing={1.5}
      alignItems="center"
      sx={{ px: 2.5, py: 3 }}
    >
      <Box
        aria-hidden
        sx={{
          width: 44,
          height: 44,
          bgcolor: 'primary.main',
          color: '#fff',
          display: 'grid',
          placeItems: 'center',
          fontSize: 29,
          fontWeight: 900,
          borderRadius: '12px',
          boxShadow: '0 6px 30px #f02c4540',
          transform: 'rotate(-6deg)',
        }}
      >
        X
      </Box>
      <Box>
        <Typography
          dir="ltr"
          sx={{
            fontSize: 23,
            fontWeight: 900,
            letterSpacing: '-1px',
            lineHeight: 1.1,
          }}
        >
          XBEST
          <Typography
            component="span"
            sx={{
              color: 'primary.main',
              fontSize: 'inherit',
              fontWeight: 'inherit',
            }}
          >
            .
          </Typography>
        </Typography>
        <Typography
          sx={{
            fontSize: 10,
            letterSpacing: '2px',
            color: 'text.secondary',
            mt: 0.5,
          }}
        >
          CHANNELS STUDIO
        </Typography>
      </Box>
    </Stack>
  );
  const navigation = (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
      {brand}
      <Typography
        sx={{
          px: 3,
          mb: 1.5,
          fontSize: 10,
          letterSpacing: ar ? 0 : '1.8px',
          color: 'text.secondary',
          fontWeight: 700,
        }}
      >
        {text('مساحة العمل', 'WORKSPACE')}
      </Typography>
      <Box
        component="nav"
        aria-label={text('التنقل الرئيسي', 'Main navigation')}
        sx={{ px: 1.5, flex: 1 }}
      >
        {sections.map((item) => {
          const current = item.id === active.sectionId;
          return (
            <Box key={item.id} sx={{ mb: 0.75 }}>
              <RouterButtonLink
                to={item.to}
                onClick={() => setOpen(false)}
                aria-current={
                  current
                    ? item.pages.length
                      ? 'location'
                      : 'page'
                    : undefined
                }
                sx={{
                  width: '100%',
                  justifyContent: 'flex-start',
                  gap: 1.5,
                  px: 1.75,
                  py: 1.25,
                  minHeight: 46,
                  borderRadius: '10px',
                  fontWeight: current ? 800 : 500,
                  color: current ? 'text.primary' : 'text.secondary',
                  bgcolor: current
                    ? (t) => alpha(t.palette.primary.main, 0.14)
                    : 'transparent',
                  borderInlineStart: '3px solid',
                  borderInlineStartColor: current
                    ? 'primary.main'
                    : 'transparent',
                  '&:hover': { bgcolor: 'action.hover' },
                }}
              >
                <Box
                  component="span"
                  sx={{
                    display: 'flex',
                    color: current ? 'primary.main' : 'inherit',
                    '& svg': { fontSize: 21 },
                  }}
                >
                  {item.icon}
                </Box>
                <Box component="span" sx={{ flex: 1, textAlign: 'start' }}>
                  {item.label}
                </Box>
                {item.badge && (
                  <Box
                    component="span"
                    sx={{
                      bgcolor:
                        item.badge.severity === 'warning'
                          ? 'warning.main'
                          : 'error.main',
                      color: '#fff',
                      borderRadius: '6px',
                      px: 0.75,
                      fontSize: 11,
                    }}
                  >
                    {item.badge.count}
                  </Box>
                )}
              </RouterButtonLink>
              {current && item.pages.length > 0 && (
                <Stack
                  sx={{
                    marginInlineStart: 3.5,
                    mt: 0.75,
                    borderInlineStart: '1px solid',
                    borderColor: 'divider',
                    paddingInlineStart: 1,
                  }}
                >
                  {item.pages.map((child) => (
                    <RouterButtonLink
                      key={child.id}
                      to={child.to}
                      onClick={() => setOpen(false)}
                      aria-current={
                        child.id === active.pageId ? 'page' : undefined
                      }
                      sx={{
                        justifyContent: 'flex-start',
                        color:
                          child.id === active.pageId
                            ? 'primary.main'
                            : 'text.secondary',
                        fontSize: 12,
                        px: 1.5,
                        borderRadius: '8px',
                        minHeight: 36,
                      }}
                    >
                      {child.label}
                    </RouterButtonLink>
                  ))}
                </Stack>
              )}
            </Box>
          );
        })}
      </Box>
      <Box sx={{ p: 2, mt: 4 }}>
        <Box
          sx={{
            border: '1px solid',
            borderColor: 'divider',
            borderRadius: '12px',
            p: 1.75,
            bgcolor: (t) => alpha(t.palette.primary.main, 0.04),
          }}
        >
          <Typography sx={{ fontSize: 12, fontWeight: 800 }}>
            {text('إدارة الوصول والتفعيل', 'Access & activation')}
          </Typography>
          <Typography
            sx={{ color: 'text.secondary', fontSize: 11, mt: 0.5, mb: 1 }}
          >
            {text(
              'الحسابات والليسانسات في مكان واحد',
              'Accounts and licenses, together',
            )}
          </Typography>
          <RouterButtonLink
            to="/settings/access"
            onClick={() => setOpen(false)}
            size="small"
            endIcon={<ArrowOutward />}
            sx={{ p: 0, justifyContent: 'flex-start', fontSize: 11 }}
          >
            {text('فتح لوحة التحكم', 'Open controls')}
          </RouterButtonLink>
        </Box>
      </Box>
    </Box>
  );
  return (
    <Box
      dir={ar ? 'rtl' : 'ltr'}
      className="xbest-workspace"
      sx={{ minHeight: '100dvh', bgcolor: 'background.default' }}
    >
      <Box
        component="a"
        href="#studio-content"
        sx={{
          position: 'fixed',
          top: -60,
          zIndex: 1600,
          '&:focus': { top: 8, insetInlineStart: 8 },
          p: 1,
          bgcolor: 'background.paper',
          color: 'primary.main',
        }}
      >
        {text('انتقل للمحتوى', 'Skip to content')}
      </Box>
      <Box
        component="aside"
        sx={{
          display: { xs: 'none', lg: 'block' },
          position: 'fixed',
          insetBlock: 0,
          insetInlineStart: 0,
          width: 256,
          zIndex: 1100,
          overflowY: 'auto',
          bgcolor: 'background.paper',
          borderInlineEnd: '1px solid',
          borderColor: 'divider',
        }}
      >
        {navigation}
      </Box>
      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        anchor={ar ? 'right' : 'left'}
        slotProps={{ paper: { sx: { width: 280 }, dir: ar ? 'rtl' : 'ltr' } }}
      >
        <IconButton
          aria-label={text('إغلاق القائمة', 'Close navigation')}
          onClick={() => setOpen(false)}
          sx={{ position: 'absolute', insetInlineEnd: 8, top: 8 }}
        >
          <Close />
        </IconButton>
        {navigation}
      </Drawer>
      <Box sx={{ marginInlineStart: { lg: '256px' }, minWidth: 0 }}>
        <Box
          component="header"
          sx={{
            px: { xs: 2, md: 4 },
            minHeight: 78,
            display: 'flex',
            alignItems: 'center',
            gap: 1.5,
            position: 'sticky',
            top: 0,
            zIndex: 1090,
            bgcolor: (t) => alpha(t.palette.background.default, 0.94),
            backdropFilter: 'blur(16px)',
            borderBottom: '1px solid',
            borderColor: 'divider',
          }}
        >
          <IconButton
            aria-label={text('فتح القائمة', 'Open navigation')}
            onClick={() => setOpen(true)}
            sx={{ display: { lg: 'none' } }}
          >
            <Menu />
          </IconButton>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography
              sx={{
                fontSize: 10,
                letterSpacing: ar ? 0 : '2px',
                color: 'text.secondary',
              }}
            >
              {text('إكس بيست / استوديو القنوات', 'XBEST / CHANNELS STUDIO')}
            </Typography>
            <Typography noWrap sx={{ fontWeight: 800, fontSize: 16, mt: 0.5 }}>
              {page?.label ??
                section?.label ??
                text('مساحة العمل', 'Workspace')}
            </Typography>
          </Box>
          <Button
            onClick={onOpenSearch}
            aria-label={text('البحث والأوامر', 'Search and commands')}
            sx={{
              color: 'text.secondary',
              minWidth: 0,
              border: '1px solid',
              borderColor: 'divider',
              borderRadius: '10px',
              px: { xs: 1, sm: 2 },
              gap: 1,
            }}
          >
            <Search fontSize="small" />
            <Box
              component="span"
              sx={{ display: { xs: 'none', md: 'inline' }, fontSize: 12 }}
            >
              {text('ابحث في الاستوديو', 'Search the studio')}
            </Box>
            <Box
              component="kbd"
              sx={{
                display: { xs: 'none', md: 'inline' },
                fontSize: 10,
                bgcolor: 'action.hover',
                px: 0.75,
                py: 0.25,
                borderRadius: '4px',
              }}
            >
              {searchShortcut}
            </Box>
          </Button>
          <Divider orientation="vertical" flexItem sx={{ my: 2.5 }} />
          <Button
            size="small"
            disabled={localeBusy}
            onClick={async () => {
              setLocaleBusy(true);
              try {
                await setUiLocale(ar ? 'en' : 'ar');
              } finally {
                setLocaleBusy(false);
              }
            }}
            aria-label={text('Switch to English', 'التبديل للعربية')}
            sx={{ minWidth: 36, fontSize: 11 }}
          >
            {ar ? 'EN' : 'عربي'}
          </Button>
          <IconButton
            aria-label={text('تسجيل الخروج', 'Sign out')}
            size="small"
            onClick={async () => {
              try {
                const response = await fetch('/auth/logout', {
                  method: 'POST',
                  credentials: 'same-origin',
                });
                if (!response.ok) throw new Error('Logout failed');
                window.location.reload();
              } catch {
                setLogoutError(true);
              }
            }}
          >
            <Logout fontSize="small" />
          </IconButton>
          <IconButton
            aria-label={text('تغيير المظهر', 'Toggle appearance')}
            onClick={onToggleColorScheme}
            size="small"
          >
            {isDark ? (
              <LightModeOutlined fontSize="small" />
            ) : (
              <DarkModeOutlined fontSize="small" />
            )}
          </IconButton>
        </Box>
        <Box
          component="main"
          id="studio-content"
          tabIndex={-1}
          sx={{
            p: { xs: 2, md: 4 },
            maxWidth: 1760,
            mx: 'auto',
            outline: 'none',
            minWidth: 0,
          }}
        >
          {logoutError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {text(
                'تعذر تسجيل الخروج. تحقق من الاتصال وأعد المحاولة.',
                'Could not sign out. Check the connection and try again.',
              )}
            </Alert>
          )}
          {children}
        </Box>
        <Box
          component="footer"
          sx={{
            mx: { xs: 2, md: 4 },
            py: 2.5,
            borderTop: '1px solid',
            borderColor: 'divider',
            display: 'flex',
            justifyContent: 'space-between',
            color: 'text.secondary',
            fontSize: 10,
          }}
        >
          <span>XBEST CHANNELS STUDIO</span>
          <span>
            {text('مساحة واحدة لكل قنواتك', 'One workspace. Every channel.')}
          </span>
        </Box>
      </Box>
    </Box>
  );
}
