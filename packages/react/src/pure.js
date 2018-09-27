/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {REACT_PURE_TYPE} from 'shared/ReactSymbols';

import warningWithoutStack from 'shared/warningWithoutStack';

export default function pure<Props>(
  render: (props: Props) => React$Node,
  compare?: (oldProps: Props, newProps: Props) => boolean,
) {
  if (__DEV__) {
    if (typeof render !== 'function') {
      warningWithoutStack(
        false,
        'pure requires a render function but was given %s.',
        render === null ? 'null' : typeof render,
      );
    }
  }
  return {
    $$typeof: REACT_PURE_TYPE,
    render,
    compare: compare === undefined ? null : compare,
  };
}
