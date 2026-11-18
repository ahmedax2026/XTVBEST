import type { Nullable } from '@/types/util.js';
import { LoggerFactory } from '@/util/logging/LoggerFactory.js';
import type { Dayjs } from 'dayjs';
import type { Duration } from 'dayjs/plugin/duration.js';
import { isUndefined } from 'lodash-es';
import events from 'node:events';
import { PassThrough } from 'node:stream';
import type { FfmpegEvents, FfmpegProcess } from './FfmpegProcess.js';

enum State {
  Idle = 'idle',
  Started = 'started',
  Ended = 'ended',
  Error = 'error',
}

/**
 * Represents a single ffmpeg transcode stream. Allows for interaction
 * with the underlying ffmpeg process, emits relevant events, and contains
 * metadata about the stream.
 */
export class FfmpegTranscodeSession extends events.EventEmitter<FfmpegEvents> {
  private logger = LoggerFactory.child({
    className: FfmpegTranscodeSession.name,
    caller: import.meta,
  });
  private state = State.Idle;
  private cleanupCallbacks: Array<() => Promise<void>> = [];
  private cleanupTask?: Promise<void>;

  constructor(
    public process: FfmpegProcess,
    public streamDuration: Duration,
    public streamEndTime: Dayjs,
  ) {
    super();
    // Connect the session to the process.
    // The transcode session simply forwards all of the events
    // of the underlying process to consumers
    this.process.on('end', (...args) => {
      this.emit('end', ...args);
    });

    this.process.on('error', (...args) => {
      this.emit('error', ...args);
    });

    this.process.on('exit', (...args) => {
      void this.cleanup();
      this.emit('exit', ...args);
    });
  }

  start(sink?: PassThrough) {
    const out = sink ?? new PassThrough();
    if (this.state !== State.Idle) {
      throw new Error(
        `Session was already started, or has ended (current state = ${this.state})`,
      );
    }

    const rawStream = this.process.start();
    void this.process.exited.then(() => this.cleanup());
    if (isUndefined(rawStream)) {
      this.state = State.Error;
      this.kill();
      throw new Error('Error starting the underlying ffmpeg process.');
    }

    this.process.on('end', () => {
      this.state = State.Ended;
      out.push(null);
    });

    this.process.on('error', (err) => {
      this.state = State.Error;
      this.logger.error(err, 'Error playing video');
      rawStream.unpipe(sink);
    });

    return rawStream.pipe(out, { end: false });
  }

  wait(): Promise<{
    code: Nullable<number>;
    signal: Nullable<NodeJS.Signals>;
  }> {
    return new Promise((resolve) => {
      this.process.once('exit', (code, signal) => resolve({ code, signal }));
    });
  }

  kill() {
    this.state = State.Ended;
    this.process.kill();
    void this.process.exited.then(() => this.cleanup());
  }

  registerCleanup(callback: () => Promise<void>) {
    this.cleanupCallbacks.push(callback);
  }
  private cleanup() {
    return (this.cleanupTask ??= Promise.allSettled(
      this.cleanupCallbacks.map((callback) => Promise.resolve().then(callback)),
    ).then((results) => {
      for (const result of results)
        if (result.status === 'rejected')
          this.logger.warn(
            result.reason,
            'Could not remove temporary streaming assets',
          );
    }));
  }

  get exited(): Promise<void> {
    return this.process.exited.then(() => this.cleanup());
  }
}
