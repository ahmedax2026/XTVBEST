import { Trans, useLingui } from '@lingui/react/macro';
import {
  Box,
  Button,
  Chip,
  FormControl,
  FormControlLabel,
  FormHelperText,
  Stack,
  Switch,
  Typography,
} from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import { useSettings } from '../../store/settings/selectors.ts';
import type { SubmitHandler } from 'react-hook-form';
import { Controller, useForm } from 'react-hook-form';
import {
  getApiSystemFeatureFlagsOptions,
  getApiSystemFeatureFlagsQueryKey,
  putApiSystemFeatureFlagsMutation,
} from '../../generated/@tanstack/react-query.gen.ts';

type FlagKey =
  | 'proxyArtwork'
  | 'tonemapEnabled'
  | 'webvttSidecarEnabled'
  | 'disableSearchSnapshotInBackup'
  | 'disableVulkan'
  | 'disableVaapiPad';

type FlagFormValues = Record<FlagKey, boolean>;

type MetaEntry = {
  key: string;
  displayName: string;
  description: string;
  category: 'experimental' | 'escape-hatch';
  envOverride: boolean;
};

const arabicFeatureHelp: Record<string, [string, string]> = {
  proxyArtwork: [
    'تمرير الصور عبر السيرفر',
    'يجلب XBEST الصور بدلًا من اتصال المشغل المباشر بمصدر الوسائط.',
  ],
  tonemapEnabled: [
    'تحويل ألوان HDR',
    'تحويل HDR إلى SDR أثناء تحويل الفيديو باستخدام تسريع الهاردوير.',
  ],
  webvttSidecarEnabled: [
    'ملفات ترجمة WebVTT',
    'إنشاء ملفات ترجمة منفصلة أثناء البث.',
  ],
  xmltvCreditImagesEnabled: [
    'صور طاقم العمل في XMLTV',
    'إضافة صور الأشخاص لدليل البرامج. يلزم إعادة إنشاء الدليل.',
  ],
  disableSearchSnapshotInBackup: [
    'استبعاد لقطة البحث من النسخ الاحتياطي',
    'عدم تضمين لقطة فهرس البحث في النسخة الاحتياطية لقاعدة البيانات.',
  ],
  disableVulkan: [
    'تعطيل Vulkan مع NVIDIA',
    'تعطيل معالجة Vulkan ضمن مسار تسريع كارت الشاشة.',
  ],
  disableVaapiPad: [
    'تعطيل المحاذاة باستخدام VAAPI',
    'تعطيل إضافة الحواف المسرّعة في مسار VAAPI.',
  ],
  ersatzTvNextEnabled: [
    'محرك البث الإضافي التجريبي',
    'تطبيق المحرك الإضافي على جميع القنوات. اتركه معطلًا لاختيار المحرك لكل قناة على حدة.',
  ],
};

function FlagSection({
  title,
  flags,
  control,
}: {
  title: string;
  flags: MetaEntry[];
  control: ReturnType<typeof useForm<FlagFormValues>>['control'];
}) {
  const ar = useSettings().ui.i18n.locale === 'ar';
  if (flags.length === 0) return null;

  return (
    <Box>
      <Typography variant="h6" gutterBottom>
        {title}
      </Typography>
      <Stack spacing={2}>
        {flags.map((meta) => (
          <FormControl key={meta.key} component="fieldset" fullWidth>
            <Stack direction="row" alignItems="center" spacing={1}>
              <Controller
                name={meta.key as FlagKey}
                control={control}
                render={({ field }) => (
                  <FormControlLabel
                    label={
                      ar
                        ? (arabicFeatureHelp[meta.key]?.[0] ?? meta.displayName)
                        : meta.displayName
                    }
                    control={
                      <Switch
                        {...field}
                        checked={field.value}
                        disabled={meta.envOverride}
                      />
                    }
                  />
                )}
              />
              {meta.envOverride && (
                <Chip
                  label={<Trans>Set by environment variable</Trans>}
                  size="small"
                />
              )}
            </Stack>
            <FormHelperText sx={{ ml: 0 }}>
              {ar
                ? (arabicFeatureHelp[meta.key]?.[1] ?? meta.description)
                : meta.description}
            </FormHelperText>
          </FormControl>
        ))}
      </Stack>
    </Box>
  );
}

export default function FeaturesSettingsPage() {
  const { t } = useLingui();
  const { data, isPending, error } = useQuery(
    getApiSystemFeatureFlagsOptions(),
  );
  const snackbar = useSnackbar();
  const queryClient = useQueryClient();

  const {
    control,
    handleSubmit,
    reset,
    formState: { isDirty, isSubmitting },
  } = useForm<FlagFormValues>({
    defaultValues: data?.flags as FlagFormValues,
    values: data?.flags as FlagFormValues,
  });

  const updateMutation = useMutation({
    ...putApiSystemFeatureFlagsMutation(),
    onSuccess: (result) => {
      snackbar.enqueueSnackbar(t`Feature flags saved!`, { variant: 'success' });
      reset(result.flags, { keepValues: true });
      return queryClient.invalidateQueries({
        queryKey: getApiSystemFeatureFlagsQueryKey(),
      });
    },
    onError: () => {
      snackbar.enqueueSnackbar(t`Failed to save feature flags.`, {
        variant: 'error',
      });
    },
  });

  const onSubmit: SubmitHandler<FlagFormValues> = (values) => {
    updateMutation.mutate({ body: values });
  };

  if (isPending) {
    return null;
  }

  if (error) {
    return (
      <Typography color="error">
        <Trans>Failed to load feature flags.</Trans>
      </Typography>
    );
  }

  const metadata = data?.metadata ?? [];
  const experimental = metadata.filter((m) => m.category === 'experimental');
  const escapeHatches = metadata.filter((m) => m.category === 'escape-hatch');

  return (
    <Box component="form" onSubmit={handleSubmit(onSubmit)}>
      <Stack spacing={4}>
        <FlagSection
          title={t`Experimental Features`}
          flags={experimental}
          control={control}
        />
        <FlagSection
          title={t`Escape Hatches`}
          flags={escapeHatches}
          control={control}
        />
      </Stack>
      <Stack direction="row" justifyContent="right" spacing={2} sx={{ mt: 3 }}>
        {isDirty && (
          <Button
            variant="outlined"
            onClick={() => reset(data?.flags)}
            disabled={isSubmitting}
          >
            <Trans>Reset Changes</Trans>
          </Button>
        )}
        <Button
          variant="contained"
          type="submit"
          disabled={!isDirty || isSubmitting}
        >
          <Trans>Save</Trans>
        </Button>
      </Stack>
    </Box>
  );
}
