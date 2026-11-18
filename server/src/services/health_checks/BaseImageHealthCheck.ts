import { injectable } from 'inversify';
import { BASE_IMAGE_TAG_ENV_VAR, getEnvVar } from '../../util/env.ts';
import type { HealthCheck, HealthCheckResult } from './HealthCheck.ts';
import { healthCheckResult } from './HealthCheck.ts';

@injectable()
export class BaseImageHealthCheck implements HealthCheck {
  readonly id = BaseImageHealthCheck.name;

  getStatus(): Promise<HealthCheckResult> {
    const baseImage = getEnvVar(BASE_IMAGE_TAG_ENV_VAR);
    if (!baseImage) {
      return Promise.resolve(healthCheckResult({ type: 'healthy' }));
    }

    if (baseImage.endsWith('vaapi') || baseImage.endsWith('nvidia')) {
      const newImage = baseImage.split('-')[0];
      return Promise.resolve(
        healthCheckResult({
          type: 'warning',
          context: `XBEST: the Docker image variant ${baseImage} is deprecated. Update your image to the maintained ${newImage} variant, which includes hardware acceleration support.`,
        }),
      );
    }

    return Promise.resolve(healthCheckResult({ type: 'healthy' }));
  }
}
