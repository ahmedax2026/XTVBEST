import useStore from '@/store';
import { setCurrentLineup } from '@/store/channelEditor/actions';
import { materializedProgramListSelector } from '@/store/selectors';
import type { ChannelProgram } from '@tunarr/types';
import { isFlexProgram, isContentProgram } from '@tunarr/types';
import type { Duration } from 'dayjs/plugin/duration';
import { random } from '../../helpers/random.ts';

export function useAddBreaks() {
  const programs = useStore(materializedProgramListSelector);

  return (config: AddBreaksConfig) => {
    setCurrentLineup(addBreaks(programs, config), true);
  };
}

export function insertStudioBumpers(
  programs: ChannelProgram[],
): ChannelProgram[] {
  return programs.flatMap((program, index) => {
    const next = programs[(index + 1) % programs.length];
    return isContentProgram(program) && next && isContentProgram(next)
      ? [program, { type: 'flex' as const, duration: 5000 }]
      : [program];
  });
}
export function useAddStudioBumpers() {
  const programs = useStore(materializedProgramListSelector);
  return () => setCurrentLineup(insertStudioBumpers(programs), true);
}

export function addBreaks(
  programs: ChannelProgram[],
  { afterDuration, minDuration, maxDuration }: AddBreaksConfig,
) {
  const afterMillis = +afterDuration;
  const newPrograms: ChannelProgram[] = [];

  let durWithoutBreak = 0;
  for (const program of programs) {
    if (isFlexProgram(program)) {
      durWithoutBreak = 0;
    } else {
      if (durWithoutBreak + program.duration >= afterMillis) {
        durWithoutBreak = 0;
        const duration = random.integer(+minDuration, +maxDuration);
        newPrograms.push({
          type: 'flex',
          duration,
        });
      } else {
        durWithoutBreak += program.duration;
      }
    }
    newPrograms.push(program);
  }

  return newPrograms;
}

export type AddBreaksConfig = {
  afterDuration: Duration;
  minDuration: Duration;
  maxDuration: Duration;
};
