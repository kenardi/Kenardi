/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

'use strict';

declare var jest: {
  fn: () => {
    mockClear: () => void,
  },
};

export function createMockSubscriber() {
  const subscriber = {
    onInteractionScheduledWorkCompleted: jest.fn(), // eslint-disable-line no-undef
    onInteractionTraced: jest.fn(), // eslint-disable-line no-undef
    onWorkCanceled: jest.fn(), // eslint-disable-line no-undef
    onWorkScheduled: jest.fn(), // eslint-disable-line no-undef
    onWorkStarted: jest.fn(), // eslint-disable-line no-undef
    onWorkStopped: jest.fn(), // eslint-disable-line no-undef

    // Convenience method to reset all mocked functions
    clear: () => {
      subscriber.onInteractionScheduledWorkCompleted.mockClear();
      subscriber.onInteractionTraced.mockClear();
      subscriber.onWorkCanceled.mockClear();
      subscriber.onWorkScheduled.mockClear();
      subscriber.onWorkStarted.mockClear();
      subscriber.onWorkStopped.mockClear();
    },
  };
  return subscriber;
}
