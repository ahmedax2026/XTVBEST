import { ErrorOutline, Refresh, ContentCopy } from '@mui/icons-material';
import { Alert, Box, Button, Stack, Typography } from '@mui/material';
import { useState } from 'react';
import { useSettings } from '../store/settings/selectors.ts';

type Props = { error: unknown; resetRoute: () => void };
export function ErrorPage({ error, resetRoute }: Props) {
  const ar = useSettings().ui.i18n.locale === 'ar';
  const text = (arabic: string, english: string) => (ar ? arabic : english);
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  return (
    <Box
      sx={{
        mx: 'auto',
        my: 6,
        p: { xs: 3, md: 6 },
        maxWidth: 680,
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: '18px',
        bgcolor: 'background.paper',
        textAlign: 'center',
      }}
    >
      <ErrorOutline sx={{ color: 'primary.main', fontSize: 48, mb: 2 }} />
      <Typography
        sx={{
          color: 'primary.main',
          letterSpacing: 2,
          fontSize: 10,
          fontWeight: 800,
        }}
      >
        XBEST CHANNELS STUDIO
      </Typography>
      <Typography component="h1" sx={{ fontSize: 26, fontWeight: 800, mt: 2 }}>
        {text('تعذر فتح هذه الصفحة', 'This page could not be opened')}
      </Typography>
      <Typography sx={{ color: 'text.secondary', lineHeight: 1.9, my: 2 }}>
        {text(
          'جرّب تحميلها مرة أخرى. يمكنك نسخ تقرير الخطأ لمراجعته مع مسؤول البرنامج.',
          'Try loading it again. You can copy an error report to review with your administrator.',
        )}
      </Typography>
      <Stack direction="row" gap={1.5} justifyContent="center" flexWrap="wrap">
        <Button
          onClick={resetRoute}
          variant="contained"
          startIcon={<Refresh />}
        >
          {text('إعادة المحاولة', 'Retry')}
        </Button>
        <Button
          variant="outlined"
          startIcon={<ContentCopy />}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(
                error instanceof Error
                  ? `${error.name}: ${error.message}\n${error.stack ?? ''}`
                  : String(error),
              );
              setCopied(true);
              setCopyFailed(false);
            } catch {
              setCopyFailed(true);
            }
          }}
        >
          {text('نسخ تقرير الخطأ', 'Copy error report')}
        </Button>
      </Stack>
      {copied && (
        <Alert severity="success" sx={{ mt: 2 }}>
          {text('تم نسخ التقرير', 'Report copied')}
        </Alert>
      )}
      {copyFailed && (
        <Alert severity="error" sx={{ mt: 2 }}>
          {text(
            'تعذر النسخ. اسمح بالوصول للحافظة وحاول مجددًا.',
            'Could not copy. Allow clipboard access and try again.',
          )}
        </Alert>
      )}
    </Box>
  );
}
