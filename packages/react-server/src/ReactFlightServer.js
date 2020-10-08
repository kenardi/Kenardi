/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

import type {Dispatcher as DispatcherType} from 'react-reconciler/src/ReactInternalTypes';
import type {
  Destination,
  Chunk,
  BundlerConfig,
  ModuleMetaData,
  ModuleReference,
} from './ReactFlightServerConfig';

import {
  scheduleWork,
  beginWriting,
  writeChunk,
  completeWriting,
  flushBuffered,
  close,
  processModelChunk,
  processErrorChunk,
  resolveModuleMetaData,
} from './ReactFlightServerConfig';

import {
  REACT_BLOCK_TYPE,
  REACT_ELEMENT_TYPE,
  REACT_DEBUG_TRACING_MODE_TYPE,
  REACT_FORWARD_REF_TYPE,
  REACT_FRAGMENT_TYPE,
  REACT_LAZY_TYPE,
  REACT_LEGACY_HIDDEN_TYPE,
  REACT_MEMO_TYPE,
  REACT_OFFSCREEN_TYPE,
  REACT_PROFILER_TYPE,
  REACT_SCOPE_TYPE,
  REACT_SERVER_BLOCK_TYPE,
  REACT_STRICT_MODE_TYPE,
  REACT_SUSPENSE_TYPE,
  REACT_SUSPENSE_LIST_TYPE,
} from 'shared/ReactSymbols';

import * as React from 'react';
import ReactSharedInternals from 'shared/ReactSharedInternals';
import invariant from 'shared/invariant';

const isArray = Array.isArray;

type ReactJSONValue =
  | string
  | boolean
  | number
  | null
  | $ReadOnlyArray<ReactJSONValue>
  | ReactModelObject;

export type ReactModel =
  | React$Element<any>
  | string
  | boolean
  | number
  | null
  | Iterable<ReactModel>
  | ReactModelObject;

type ReactModelObject = {+[key: string]: ReactModel};

type Segment = {
  id: number,
  query: () => ReactModel,
  ping: () => void,
};

export type Request = {
  destination: Destination,
  bundlerConfig: BundlerConfig,
  nextChunkId: number,
  pendingChunks: number,
  pingedSegments: Array<Segment>,
  completedJSONChunks: Array<Chunk>,
  completedErrorChunks: Array<Chunk>,
  flowing: boolean,
  toJSON: (key: string, value: ReactModel) => ReactJSONValue,
};

const ReactCurrentDispatcher = ReactSharedInternals.ReactCurrentDispatcher;

export function createRequest(
  model: ReactModel,
  destination: Destination,
  bundlerConfig: BundlerConfig,
): Request {
  const pingedSegments = [];
  const request = {
    destination,
    bundlerConfig,
    nextChunkId: 0,
    pendingChunks: 0,
    pingedSegments: pingedSegments,
    completedJSONChunks: [],
    completedErrorChunks: [],
    flowing: false,
    toJSON: function(key: string, value: ReactModel): ReactJSONValue {
      return resolveModelToJSON(request, this, key, value);
    },
  };
  request.pendingChunks++;
  const rootSegment = createSegment(request, () => model);
  pingedSegments.push(rootSegment);
  return request;
}

function attemptResolveElement(element: React$Element<any>): ReactModel {
  const type = element.type;
  const props = element.props;
  if (typeof type === 'function') {
    // This is a server-side component.
    return type(props);
  } else if (typeof type === 'string') {
    // This is a host element. E.g. HTML.
    return [REACT_ELEMENT_TYPE, type, element.key, element.props];
  } else if (type[0] === REACT_SERVER_BLOCK_TYPE) {
    return [REACT_ELEMENT_TYPE, type, element.key, element.props];
  } else if (
    type === REACT_FRAGMENT_TYPE ||
    type === REACT_STRICT_MODE_TYPE ||
    type === REACT_PROFILER_TYPE ||
    type === REACT_SCOPE_TYPE ||
    type === REACT_DEBUG_TRACING_MODE_TYPE ||
    type === REACT_LEGACY_HIDDEN_TYPE ||
    type === REACT_OFFSCREEN_TYPE ||
    // TODO: These are temporary shims
    // and we'll want a different behavior.
    type === REACT_SUSPENSE_TYPE ||
    type === REACT_SUSPENSE_LIST_TYPE
  ) {
    return element.props.children;
  } else if (type != null && typeof type === 'object') {
    switch (type.$$typeof) {
      case REACT_FORWARD_REF_TYPE: {
        const render = type.render;
        return render(props, undefined);
      }
      case REACT_MEMO_TYPE: {
        const nextChildren = React.createElement(type.type, element.props);
        return attemptResolveElement(nextChildren);
      }
    }
  }
  invariant(false, 'Unsupported type.');
}

function pingSegment(request: Request, segment: Segment): void {
  const pingedSegments = request.pingedSegments;
  pingedSegments.push(segment);
  if (pingedSegments.length === 1) {
    scheduleWork(() => performWork(request));
  }
}

function createSegment(request: Request, query: () => ReactModel): Segment {
  const id = request.nextChunkId++;
  const segment = {
    id,
    query,
    ping: () => pingSegment(request, segment),
  };
  return segment;
}

function serializeIDRef(id: number): string {
  return '$' + id.toString(16);
}

function escapeStringValue(value: string): string {
  if (value[0] === '$' || value[0] === '@') {
    // We need to escape $ or @ prefixed strings since we use those to encode
    // references to IDs and as special symbol values.
    return '$' + value;
  } else {
    return value;
  }
}

function isObjectPrototype(object): boolean {
  if (!object) {
    return false;
  }
  // $FlowFixMe
  const ObjectPrototype = Object.prototype;
  if (object === ObjectPrototype) {
    return true;
  }
  // It might be an object from a different Realm which is
  // still just a plain simple object.
  if (Object.getPrototypeOf(object)) {
    return false;
  }
  const names = Object.getOwnPropertyNames(object);
  for (let i = 0; i < names.length; i++) {
    if (!(names[i] in ObjectPrototype)) {
      return false;
    }
  }
  return true;
}

function isSimpleObject(object): boolean {
  if (!isObjectPrototype(Object.getPrototypeOf(object))) {
    return false;
  }
  const names = Object.getOwnPropertyNames(object);
  for (let i = 0; i < names.length; i++) {
    const descriptor = Object.getOwnPropertyDescriptor(object, names[i]);
    if (!descriptor) {
      return false;
    }
    if (!descriptor.enumerable) {
      if ((names[i] === 'key' || names[i] === 'ref') && typeof descriptor.get === 'function') {
        // React adds key and ref getters to props objects to issue warnings.
        // Those getters will not be transferred to the client, but that's ok,
        // so we'll special case them.
        continue;
      }
      return false;
    }
  }
  return true;
}

function objectName(object): string {
  const name = Object.prototype.toString.call(object);
  return name.replace(/^\[object (.*)\]$/, function(m, p0) {
    return p0;
  });
}

function describeKeyForErrorMessage(key: string): string {
  const encodedKey = JSON.stringify(key);
  return '"' + key + '"' === encodedKey ? key : encodedKey;
}

function describeValueForErrorMessage(value: ReactModel): string {
  switch (typeof value) {
    case 'string': {
      return JSON.stringify(
        value.length <= 10 ? value : value.substr(0, 10) + '...',
      );
    }
    case 'object': {
      if (isArray(value)) {
        return '[...]';
      }
      const name = objectName(value);
      if (name === 'Object') {
        return '{...}';
      }
      return name;
    }
    case 'function':
      return 'function';
    default:
      // eslint-disable-next-line
      return String(value);
  }
}

function describeObjectForErrorMessage(
  objectOrArray:
    | {+[key: string | number]: ReactModel}
    | $ReadOnlyArray<ReactModel>,
  expandedName?: string,
): string {
  if (isArray(objectOrArray)) {
    let str = '[';
    // $FlowFixMe: Should be refined by now.
    const array: $ReadOnlyArray<ReactModel> = objectOrArray;
    for (let i = 0; i < array.length; i++) {
      if (i > 0) {
        str += ', ';
      }
      if (i > 6) {
        str += '...';
        break;
      }
      const value = array[i];
      if (
        '' + i === expandedName &&
        typeof value === 'object' &&
        value !== null
      ) {
        str += describeObjectForErrorMessage(value);
      } else {
        str += describeValueForErrorMessage(value);
      }
    }
    str += ']';
    return str;
  } else {
    let str = '{';
    // $FlowFixMe: Should be refined by now.
    const object: {+[key: string | number]: ReactModel} = objectOrArray;
    const names = Object.keys(object);
    for (let i = 0; i < names.length; i++) {
      if (i > 0) {
        str += ', ';
      }
      if (i > 6) {
        str += '...';
        break;
      }
      const name = names[i];
      str += describeKeyForErrorMessage(name) + ': ';
      const value = object[name];
      if (
        name === expandedName &&
        typeof value === 'object' &&
        value !== null
      ) {
        str += describeObjectForErrorMessage(value);
      } else {
        str += describeValueForErrorMessage(value);
      }
    }
    str += '}';
    return str;
  }
}

export function resolveModelToJSON(
  request: Request,
  parent: {+[key: string | number]: ReactModel} | $ReadOnlyArray<ReactModel>,
  key: string,
  value: ReactModel,
): ReactJSONValue {
  if (__DEV__) {
    // $FlowFixMe
    const originalValue = parent[key];
    if (typeof originalValue === 'object' && originalValue !== value) {
      console.error(
        'Only plain objects can be passed to client components from server components. ' +
          'Objects with toJSON methods are not supported. Convert it manually ' +
          'to a simple value before passing it to props. ' +
          'Remove %s from these props: %s',
        describeKeyForErrorMessage(key),
        describeObjectForErrorMessage(parent),
      );
    }
  }

  // Special Symbols
  switch (value) {
    case REACT_ELEMENT_TYPE:
      return '$';
    case REACT_SERVER_BLOCK_TYPE:
      return '@';
    case REACT_LAZY_TYPE:
    case REACT_BLOCK_TYPE:
      invariant(
        false,
        'React Blocks (and Lazy Components) are expected to be replaced by a ' +
          'compiler on the server. Try configuring your compiler set up and avoid ' +
          'using React.lazy inside of Blocks.',
      );
  }

  if (parent[0] === REACT_SERVER_BLOCK_TYPE) {
    // We're currently encoding part of a Block. Look up which key.
    switch (key) {
      case '1': {
        // Module reference
        const moduleReference: ModuleReference<any> = (value: any);
        try {
          const moduleMetaData: ModuleMetaData = resolveModuleMetaData(
            request.bundlerConfig,
            moduleReference,
          );
          return (moduleMetaData: ReactJSONValue);
        } catch (x) {
          request.pendingChunks++;
          const errorId = request.nextChunkId++;
          emitErrorChunk(request, errorId, x);
          return serializeIDRef(errorId);
        }
      }
      case '2': {
        // Load function
        const load: () => ReactModel = (value: any);
        try {
          // Attempt to resolve the data.
          return load();
        } catch (x) {
          if (
            typeof x === 'object' &&
            x !== null &&
            typeof x.then === 'function'
          ) {
            // Something suspended, we'll need to create a new segment and resolve it later.
            request.pendingChunks++;
            const newSegment = createSegment(request, load);
            const ping = newSegment.ping;
            x.then(ping, ping);
            return serializeIDRef(newSegment.id);
          } else {
            // This load failed, encode the error as a separate row and reference that.
            request.pendingChunks++;
            const errorId = request.nextChunkId++;
            emitErrorChunk(request, errorId, x);
            return serializeIDRef(errorId);
          }
        }
      }
      default: {
        invariant(
          false,
          'A server block should never encode any other slots. This is a bug in React.',
        );
      }
    }
  }

  // Resolve server components.
  while (
    typeof value === 'object' &&
    value !== null &&
    value.$$typeof === REACT_ELEMENT_TYPE
  ) {
    // TODO: Concatenate keys of parents onto children.
    const element: React$Element<any> = (value: any);
    try {
      // Attempt to render the server component.
      value = attemptResolveElement(element);
    } catch (x) {
      if (typeof x === 'object' && x !== null && typeof x.then === 'function') {
        // Something suspended, we'll need to create a new segment and resolve it later.
        request.pendingChunks++;
        const newSegment = createSegment(request, () => value);
        const ping = newSegment.ping;
        x.then(ping, ping);
        return serializeIDRef(newSegment.id);
      } else {
        // Something errored. Don't bother encoding anything up to here.
        throw x;
      }
    }
  }

  if (typeof value === 'object') {
    if (__DEV__) {
      if (value !== null && !isArray(value)) {
        // Verify that this is a simple plain object.
        if (objectName(value) !== 'Object') {
          console.error(
            'Only plain objects can be passed to client components from server components. ' +
              'Built-ins like %s are not supported. ' +
              'Remove %s from these props: %s',
            objectName(value),
            describeKeyForErrorMessage(key),
            describeObjectForErrorMessage(parent),
          );
        } else if (!isSimpleObject(value)) {
          console.error(
            'Only plain objects can be passed to client components from server components. ' +
              'Classes or other objects with methods are not supported. ' +
              'Remove %s from these props: %s',
            describeKeyForErrorMessage(key),
            describeObjectForErrorMessage(parent, key),
          );
        } else if (Object.getOwnPropertySymbols) {
          const symbols = Object.getOwnPropertySymbols(value);
          if (symbols.length > 0) {
            console.error(
              'Only plain objects can be passed to client components from server components. ' +
                'Objects with symbol properties like %s are not supported. ' +
                'Remove %s from these props: %s',
              symbols[0].description,
              describeKeyForErrorMessage(key),
              describeObjectForErrorMessage(parent, key),
            );
          }
        }
      }
    }
    return value;
  }

  if (typeof value === 'string') {
    return escapeStringValue(value);
  }

  if (
    typeof value === 'boolean' ||
    typeof value === 'number' ||
    typeof value === 'undefined'
  ) {
    return value;
  }

  if (typeof value === 'function') {
    if (/^on[A-Z]/.test(key)) {
      invariant(
        false,
        'Event handlers cannot be passed to client component props. ' +
          'Remove %s from these props if possible: %s\n' +
          'If you need interactivity, consider converting part of this to a client component.',
        describeKeyForErrorMessage(key),
        describeObjectForErrorMessage(parent),
      );
    } else {
      invariant(
        false,
        'Functions cannot be passed directly to client components ' +
          "because they're not serializable. " +
          'Remove %s (%s) from this object, or avoid the entire object: %s',
        describeKeyForErrorMessage(key),
        value.displayName || value.name || 'function',
        describeObjectForErrorMessage(parent),
      );
    }
  }

  if (typeof value === 'symbol') {
    invariant(
      false,
      'Symbol values (%s) cannot be passed to client components. ' +
        'Remove %s from this object, or avoid the entire object: %s',
      value.description,
      describeKeyForErrorMessage(key),
      describeObjectForErrorMessage(parent),
    );
  }

  // $FlowFixMe: bigint isn't added to Flow yet.
  if (typeof value === 'bigint') {
    invariant(
      false,
      'BigInt (%s) is not yet supported in client component props. ' +
        'Remove %s from this object or use a plain number instead: %s',
      value,
      describeKeyForErrorMessage(key),
      describeObjectForErrorMessage(parent),
    );
  }

  invariant(
    false,
    'Type %s is not supported in client component props. ' +
      'Remove %s from this object, or avoid the entire object: %s',
    typeof value,
    describeKeyForErrorMessage(key),
    describeObjectForErrorMessage(parent),
  );
}

function emitErrorChunk(request: Request, id: number, error: mixed): void {
  // TODO: We should not leak error messages to the client in prod.
  // Give this an error code instead and log on the server.
  // We can serialize the error in DEV as a convenience.
  let message;
  let stack = '';
  try {
    if (error instanceof Error) {
      message = '' + error.message;
      stack = '' + error.stack;
    } else {
      message = 'Error: ' + (error: any);
    }
  } catch (x) {
    message = 'An error occurred but serializing the error message failed.';
  }

  const processedChunk = processErrorChunk(request, id, message, stack);
  request.completedErrorChunks.push(processedChunk);
}

function retrySegment(request: Request, segment: Segment): void {
  const query = segment.query;
  let value;
  try {
    value = query();
    while (
      typeof value === 'object' &&
      value !== null &&
      value.$$typeof === REACT_ELEMENT_TYPE
    ) {
      // TODO: Concatenate keys of parents onto children.
      const element: React$Element<any> = (value: any);
      // Attempt to render the server component.
      // Doing this here lets us reuse this same segment if the next component
      // also suspends.
      segment.query = () => value;
      value = attemptResolveElement(element);
    }
    const processedChunk = processModelChunk(request, segment.id, value);
    request.completedJSONChunks.push(processedChunk);
  } catch (x) {
    if (typeof x === 'object' && x !== null && typeof x.then === 'function') {
      // Something suspended again, let's pick it back up later.
      const ping = segment.ping;
      x.then(ping, ping);
      return;
    } else {
      // This errored, we need to serialize this error to the
      emitErrorChunk(request, segment.id, x);
    }
  }
}

function performWork(request: Request): void {
  const prevDispatcher = ReactCurrentDispatcher.current;
  ReactCurrentDispatcher.current = Dispatcher;

  const pingedSegments = request.pingedSegments;
  request.pingedSegments = [];
  for (let i = 0; i < pingedSegments.length; i++) {
    const segment = pingedSegments[i];
    retrySegment(request, segment);
  }
  if (request.flowing) {
    flushCompletedChunks(request);
  }

  ReactCurrentDispatcher.current = prevDispatcher;
}

let reentrant = false;
function flushCompletedChunks(request: Request): void {
  if (reentrant) {
    return;
  }
  reentrant = true;
  const destination = request.destination;
  beginWriting(destination);
  try {
    const jsonChunks = request.completedJSONChunks;
    let i = 0;
    for (; i < jsonChunks.length; i++) {
      request.pendingChunks--;
      const chunk = jsonChunks[i];
      if (!writeChunk(destination, chunk)) {
        request.flowing = false;
        i++;
        break;
      }
    }
    jsonChunks.splice(0, i);
    const errorChunks = request.completedErrorChunks;
    i = 0;
    for (; i < errorChunks.length; i++) {
      request.pendingChunks--;
      const chunk = errorChunks[i];
      if (!writeChunk(destination, chunk)) {
        request.flowing = false;
        i++;
        break;
      }
    }
    errorChunks.splice(0, i);
  } finally {
    reentrant = false;
    completeWriting(destination);
  }
  flushBuffered(destination);
  if (request.pendingChunks === 0) {
    // We're done.
    close(destination);
  }
}

export function startWork(request: Request): void {
  request.flowing = true;
  scheduleWork(() => performWork(request));
}

export function startFlowing(request: Request): void {
  request.flowing = true;
  flushCompletedChunks(request);
}

function unsupportedHook(): void {
  invariant(false, 'This Hook is not supported in Server Components.');
}

const Dispatcher: DispatcherType = {
  useMemo<T>(nextCreate: () => T): T {
    return nextCreate();
  },
  useCallback<T>(callback: T): T {
    return callback;
  },
  useDebugValue(): void {},
  useDeferredValue<T>(value: T): T {
    return value;
  },
  useTransition(): [(callback: () => void) => void, boolean] {
    return [() => {}, false];
  },
  readContext: (unsupportedHook: any),
  useContext: (unsupportedHook: any),
  useReducer: (unsupportedHook: any),
  useRef: (unsupportedHook: any),
  useState: (unsupportedHook: any),
  useLayoutEffect: (unsupportedHook: any),
  useImperativeHandle: (unsupportedHook: any),
  useEffect: (unsupportedHook: any),
  useOpaqueIdentifier: (unsupportedHook: any),
  useMutableSource: (unsupportedHook: any),
};
