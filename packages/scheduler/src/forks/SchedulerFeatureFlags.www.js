/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

// $FlowFixMe[cannot-resolve-module]
import {enableProfiling as enableProfilingFeatureFlag} from 'SchedulerFeatureFlags';

export const enableSchedulerDebugging = true;
export const enableProfiling: boolean =
  __PROFILE__ && enableProfilingFeatureFlag;
export const enableIsInputPending = true;
export const enableIsInputPendingContinuous = true;
export const frameYieldMs = 5;
export const continuousYieldMs = 10;
export const maxYieldMs = 10;
