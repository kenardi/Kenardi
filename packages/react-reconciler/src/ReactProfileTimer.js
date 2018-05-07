/**
 * Copyright (c) 2013-present, Facebook, Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

import type {Fiber} from './ReactFiber';
import type {StackCursor} from './ReactFiberStack';

import warning from 'fbjs/lib/warning';
import ReactFiberStack from './ReactFiberStack';

type Now = () => number;

/**
 * The "actual" render time is total time required to render the descendants of a Profiler component.
 * This time is stored as a stack, since Profilers can be nested.
 * This time is started during the "begin" phase and stopped during the "complete" phase.
 * It is paused (and accumulated) in the event of an interruption or an aborted render.
 */

const {checkThatStackIsEmpty, createCursor, push, pop} = ReactFiberStack();

let stackCursor: StackCursor<Fiber> = createCursor(null);
let timerPausedAt: number = 0;
let totalElapsedPauseTime: number = 0;

export function checkActualRenderTimeStackEmpty(): void {
  if (__DEV__) {
    checkThatStackIsEmpty();
  }
}

export function markActualRenderTimeStarted(fiber: Fiber, now: Now): void {
  const startTime = fiber.stateNode - (now() - totalElapsedPauseTime);

  fiber.stateNode = startTime;

  push(stackCursor, startTime, fiber);
}

export function recordElapsedActualRenderTime(fiber: Fiber, now: Now): void {
  pop(stackCursor, fiber);

  fiber.stateNode += now() - totalElapsedPauseTime;
}

export function resumeActualRenderTimerIfPaused(now: Now): void {
  if (timerPausedAt > 0) {
    totalElapsedPauseTime += now() - timerPausedAt;
    timerPausedAt = 0;
  }
}

export function pauseActualRenderTimerIfRunning(now: Now): void {
  if (timerPausedAt === 0) {
    timerPausedAt = now();
  }
}

/**
 * The "base" render time is the duration of the “begin” phase of work for a particular fiber.
 * This time is measured and stored on each fiber.
 * The time for all sibling fibers are accumulated and stored on their parent during the "complete" phase.
 * If a fiber bails out (sCU false) then its "base" timer is cancelled and the fiber is not updated.
 */

let baseStartTime: number = -1;

export function getElapsedBaseRenderTime(now: Now): number {
  if (__DEV__) {
    if (baseStartTime === -1) {
      warning(
        false,
        'Cannot read elapsed time when base timer is not running. ' +
          'This error is likely caused by a bug in React. ' +
          'Please file an issue.',
      );
    }
  }

  return baseStartTime === -1 ? 0 : now() - baseStartTime;
}

export function isBaseRenderTimerRunning(): boolean {
  return baseStartTime !== -1;
}

export function startBaseRenderTimer(now: Now): void {
  if (__DEV__) {
    if (baseStartTime !== -1) {
      warning(
        false,
        'Cannot start base timer that is already running. ' +
          'This error is likely caused by a bug in React. ' +
          'Please file an issue.',
      );
    }
  }

  baseStartTime = now();
}

export function stopBaseRenderTimer(): void {
  if (__DEV__) {
    if (baseStartTime === -1) {
      warning(
        false,
        'Cannot stop a base timer is not running. ' +
          'This error is likely caused by a bug in React. ' +
          'Please file an issue.',
      );
    }
  }

  baseStartTime = -1;
}
