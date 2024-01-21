/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

import {AsyncLocalStorage} from 'async_hooks';

import type {Request} from 'react-server/src/ReactFlightServer';

export * from 'react-server-dom-turbopack/src/ReactFlightServerConfigTurbopackBundler';
export * from 'react-dom-bindings/src/server/ReactFlightServerConfigDOM';

export const supportsRequestStorage = true;
export const requestStorage: AsyncLocalStorage<Request> =
  new AsyncLocalStorage();

export {createHook as createAsyncHook, executionAsyncId} from 'async_hooks';
export * from '../ReactFlightServerConfigDebugNode';
