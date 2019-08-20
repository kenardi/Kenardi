/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

import type {
  ReactDOMResponderEvent,
  ReactDOMResponderContext,
  PointerType,
} from 'shared/ReactDOMTypes';
import type {
  EventPriority,
  ReactEventResponderListener,
} from 'shared/ReactTypes';

import React from 'react';
import {DiscreteEvent, UserBlockingEvent} from 'shared/ReactTypes';

type PressProps = {|
  disabled: boolean,
  preventDefault: boolean,
  stopPropagation: boolean,
  onPress: (e: PressEvent) => void,
  onPressChange: boolean => void,
  onPressEnd: (e: PressEvent) => void,
  onPressMove: (e: PressEvent) => void,
  onPressStart: (e: PressEvent) => void,
|};

type PressState = {
  activationPosition: null | $ReadOnly<{|
    x: number,
    y: number,
  |}>,
  addedRootEvents: boolean,
  isActivePressed: boolean,
  isActivePressStart: boolean,
  isPressed: boolean,
  pointerType: PointerType,
  pressTarget: null | Element | Document,
  ignoreEmulatedMouseEvents: boolean,
  activePointerId: null | number,
  shouldPreventClick: boolean,
  touchEvent: null | Touch,
};

type PressEventType =
  | 'press'
  | 'pressmove'
  | 'pressstart'
  | 'pressend'
  | 'presschange';

type PressEvent = {|
  altKey: boolean,
  buttons: 0 | 1 | 4,
  clientX: null | number,
  clientY: null | number,
  ctrlKey: boolean,
  defaultPrevented: boolean,
  metaKey: boolean,
  pageX: null | number,
  pageY: null | number,
  pointerType: PointerType,
  screenX: null | number,
  screenY: null | number,
  shiftKey: boolean,
  target: Element | Document,
  timeStamp: number,
  type: PressEventType,
  x: null | number,
  y: null | number,
|};

const hasPointerEvents =
  typeof window !== 'undefined' && window.PointerEvent !== undefined;

const isMac =
  typeof window !== 'undefined' && window.navigator != null
    ? /^Mac/.test(window.navigator.platform)
    : false;

const targetEventTypes = ['click_active', 'keydown_active'];
const rootEventTypes = ['click', 'keyup', 'scroll'];

if (hasPointerEvents) {
  // We need to preventDefault on pointerdown for mouse/pen events
  // that are in hit target area but not the element area.
  targetEventTypes.push('pointerdown_active');
  rootEventTypes.push('pointerup', 'pointermove', 'pointercancel');
} else {
  targetEventTypes.push('touchstart', 'mousedown');
  rootEventTypes.push(
    'touchmove',
    'touchcancel',
    'touchend',
    'mousemove',
    // Used as a 'cancel' signal for mouse interactions
    'dragstart',
    // We listen to this here so stopPropagation can
    // block other mouseup events used internally
    'mouseup_active',
  );
}

function isFunction(obj): boolean {
  return typeof obj === 'function';
}

function createPressEvent(
  context: ReactDOMResponderContext,
  type: PressEventType,
  target: Element | Document,
  pointerType: PointerType,
  event: ?ReactDOMResponderEvent,
  touchEvent: null | Touch,
  defaultPrevented: boolean,
): PressEvent {
  const timeStamp = context.getTimeStamp();
  let buttons = 1;
  let clientX = null;
  let clientY = null;
  let pageX = null;
  let pageY = null;
  let screenX = null;
  let screenY = null;
  let altKey = false;
  let ctrlKey = false;
  let metaKey = false;
  let shiftKey = false;

  if (event) {
    const nativeEvent = (event.nativeEvent: any);
    ({altKey, ctrlKey, metaKey, shiftKey} = nativeEvent);
    // Only check for one property, checking for all of them is costly. We can assume
    // if clientX exists, so do the rest.
    let eventObject;
    eventObject = (touchEvent: any) || (nativeEvent: any);
    if (eventObject) {
      ({
        buttons,
        clientX,
        clientY,
        pageX,
        pageY,
        screenX,
        screenY,
      } = eventObject);
    }
  }
  return {
    altKey,
    buttons,
    clientX,
    clientY,
    ctrlKey,
    defaultPrevented,
    metaKey,
    pageX,
    pageY,
    pointerType,
    screenX,
    screenY,
    shiftKey,
    target,
    timeStamp,
    type,
    x: clientX,
    y: clientY,
  };
}

function dispatchEvent(
  event: ?ReactDOMResponderEvent,
  listener: any => void,
  context: ReactDOMResponderContext,
  state: PressState,
  name: PressEventType,
  eventPriority: EventPriority,
): void {
  const target = ((state.pressTarget: any): Element | Document);
  const pointerType = state.pointerType;
  const defaultPrevented =
    (event != null && event.nativeEvent.defaultPrevented === true) ||
    (name === 'press' && state.shouldPreventClick);
  const touchEvent = state.touchEvent;
  const syntheticEvent = createPressEvent(
    context,
    name,
    target,
    pointerType,
    event,
    touchEvent,
    defaultPrevented,
  );
  context.dispatchEvent(syntheticEvent, listener, eventPriority);
}

function dispatchPressChangeEvent(
  context: ReactDOMResponderContext,
  props: PressProps,
  state: PressState,
): void {
  const onPressChange = props.onPressChange;
  if (isFunction(onPressChange)) {
    const bool = state.isActivePressed;
    context.dispatchEvent(bool, onPressChange, DiscreteEvent);
  }
}

function dispatchPressStartEvents(
  event: ReactDOMResponderEvent,
  context: ReactDOMResponderContext,
  props: PressProps,
  state: PressState,
): void {
  state.isPressed = true;

  if (!state.isActivePressStart) {
    state.isActivePressStart = true;
    const nativeEvent: any = event.nativeEvent;
    const {clientX: x, clientY: y} = state.touchEvent || nativeEvent;
    const wasActivePressed = state.isActivePressed;
    state.isActivePressed = true;
    if (x !== undefined && y !== undefined) {
      state.activationPosition = {x, y};
    }
    const onPressStart = props.onPressStart;

    if (isFunction(onPressStart)) {
      dispatchEvent(
        event,
        onPressStart,
        context,
        state,
        'pressstart',
        DiscreteEvent,
      );
    }
    if (!wasActivePressed) {
      dispatchPressChangeEvent(context, props, state);
    }
  }
}

function dispatchPressEndEvents(
  event: ?ReactDOMResponderEvent,
  context: ReactDOMResponderContext,
  props: PressProps,
  state: PressState,
): void {
  state.isActivePressStart = false;
  state.isPressed = false;

  if (state.isActivePressed) {
    state.isActivePressed = false;
    const onPressEnd = props.onPressEnd;

    if (isFunction(onPressEnd)) {
      dispatchEvent(
        event,
        onPressEnd,
        context,
        state,
        'pressend',
        DiscreteEvent,
      );
    }
    dispatchPressChangeEvent(context, props, state);
  }
}

function dispatchCancel(
  event: ReactDOMResponderEvent,
  context: ReactDOMResponderContext,
  props: PressProps,
  state: PressState,
): void {
  state.touchEvent = null;
  if (state.isPressed) {
    state.ignoreEmulatedMouseEvents = false;
    dispatchPressEndEvents(event, context, props, state);
  }
  removeRootEventTypes(context, state);
}

function isValidKeyboardEvent(nativeEvent: Object): boolean {
  const {key, target} = nativeEvent;
  const {tagName, isContentEditable} = target;
  // Accessibility for keyboards. Space and Enter only.
  // "Spacebar" is for IE 11
  return (
    (key === 'Enter' || key === ' ' || key === 'Spacebar') &&
    (tagName !== 'INPUT' &&
      tagName !== 'TEXTAREA' &&
      isContentEditable !== true)
  );
}

function getTouchFromPressEvent(nativeEvent: TouchEvent): null | Touch {
  const targetTouches = nativeEvent.targetTouches;
  if (targetTouches.length > 0) {
    return targetTouches[0];
  }
  return null;
}

function unmountResponder(
  context: ReactDOMResponderContext,
  props: PressProps,
  state: PressState,
): void {
  if (state.isPressed) {
    removeRootEventTypes(context, state);
    dispatchPressEndEvents(null, context, props, state);
  }
}

function addRootEventTypes(
  context: ReactDOMResponderContext,
  state: PressState,
): void {
  if (!state.addedRootEvents) {
    state.addedRootEvents = true;
    context.addRootEventTypes(rootEventTypes);
  }
}

function removeRootEventTypes(
  context: ReactDOMResponderContext,
  state: PressState,
): void {
  if (state.addedRootEvents) {
    state.addedRootEvents = false;
    context.removeRootEventTypes(rootEventTypes);
  }
}

function getTouchById(
  nativeEvent: TouchEvent,
  pointerId: null | number,
): null | Touch {
  const changedTouches = nativeEvent.changedTouches;
  for (let i = 0; i < changedTouches.length; i++) {
    const touch = changedTouches[i];
    if (touch.identifier === pointerId) {
      return touch;
    }
  }
  return null;
}

function getTouchTarget(context: ReactDOMResponderContext, touchEvent: Touch) {
  const doc = context.getActiveDocument();
  return doc.elementFromPoint(touchEvent.clientX, touchEvent.clientY);
}

function handleStopPropagation(
  props: PressProps,
  context: ReactDOMResponderContext,
  nativeEvent,
): void {
  const stopPropagation = props.stopPropagation;
  if (stopPropagation === true) {
    nativeEvent.stopPropagation();
  }
}

function targetIsDocument(target: null | Node): boolean {
  // When target is null, it is the root
  return target === null || target.nodeType === 9;
}

const pressResponderImpl = {
  targetEventTypes,
  getInitialState(): PressState {
    return {
      activationPosition: null,
      addedRootEvents: false,
      isActivePressed: false,
      isActivePressStart: false,
      isPressed: false,
      pointerType: '',
      pressTarget: null,
      ignoreEmulatedMouseEvents: false,
      activePointerId: null,
      shouldPreventClick: false,
      touchEvent: null,
    };
  },
  onEvent(
    event: ReactDOMResponderEvent,
    context: ReactDOMResponderContext,
    props: PressProps,
    state: PressState,
  ): void {
    const {pointerId, pointerType, type} = event;

    if (props.disabled) {
      removeRootEventTypes(context, state);
      dispatchPressEndEvents(event, context, props, state);
      state.ignoreEmulatedMouseEvents = false;
      return;
    }
    const nativeEvent: any = event.nativeEvent;
    const isPressed = state.isPressed;

    handleStopPropagation(props, context, nativeEvent);

    switch (type) {
      // START
      case 'pointerdown':
      case 'keydown':
      case 'mousedown':
      case 'touchstart': {
        if (!isPressed) {
          const isTouchEvent = type === 'touchstart';
          const isPointerEvent = type === 'pointerdown';
          const isKeyboardEvent = pointerType === 'keyboard';
          const isMouseEvent = pointerType === 'mouse';

          // Ignore emulated mouse events
          if (type === 'mousedown' && state.ignoreEmulatedMouseEvents) {
            return;
          }

          state.shouldPreventClick = false;
          if (isTouchEvent) {
            state.ignoreEmulatedMouseEvents = true;
          } else if (isKeyboardEvent) {
            // Ignore unrelated key events
            if (isValidKeyboardEvent(nativeEvent)) {
              const {
                altKey,
                ctrlKey,
                metaKey,
                shiftKey,
              } = (nativeEvent: MouseEvent);
              if (nativeEvent.key === ' ') {
                nativeEvent.preventDefault();
              } else if (
                props.preventDefault !== false &&
                !shiftKey &&
                !metaKey &&
                !ctrlKey &&
                !altKey
              ) {
                state.shouldPreventClick = true;
              }
            } else {
              return;
            }
          }

          // We set these here, before the button check so we have this
          // data around for handling of the context menu
          state.pointerType = pointerType;
          state.pressTarget = event.responderTarget;

          if (isPointerEvent) {
            state.activePointerId = pointerId;
          } else if (isTouchEvent) {
            const touchEvent = getTouchFromPressEvent(nativeEvent);
            if (touchEvent === null) {
              return;
            }
            state.touchEvent = touchEvent;
            state.activePointerId = touchEvent.identifier;
          }

          // Ignore any device buttons except primary/secondary and touch/pen contact.
          // Additionally we ignore primary-button + ctrl-key with Macs as that
          // acts like right-click and opens the contextmenu.
          if (
            nativeEvent.buttons === 2 ||
            nativeEvent.buttons > 4 ||
            (isMac && isMouseEvent && nativeEvent.ctrlKey)
          ) {
            return;
          }
          dispatchPressStartEvents(event, context, props, state);
          addRootEventTypes(context, state);
        } else {
          // Prevent spacebar press from scrolling the window
          if (isValidKeyboardEvent(nativeEvent) && nativeEvent.key === ' ') {
            nativeEvent.preventDefault();
          }
        }
        break;
      }

      case 'click': {
        if (state.shouldPreventClick) {
          nativeEvent.preventDefault();
        }
        break;
      }
    }
  },
  onRootEvent(
    event: ReactDOMResponderEvent,
    context: ReactDOMResponderContext,
    props: PressProps,
    state: PressState,
  ): void {
    let {pointerId, pointerType, target, type} = event;

    const nativeEvent: any = event.nativeEvent;
    const isPressed = state.isPressed;
    const activePointerId = state.activePointerId;
    const previousPointerType = state.pointerType;

    handleStopPropagation(props, context, nativeEvent);

    switch (type) {
      // MOVE
      case 'pointermove':
      case 'mousemove':
      case 'touchmove': {
        let touchEvent;
        // Ignore emulated events (pointermove will dispatch touch and mouse events)
        // Ignore pointermove events during a keyboard press.
        if (previousPointerType !== pointerType) {
          return;
        }
        if (type === 'pointermove' && activePointerId !== pointerId) {
          return;
        } else if (type === 'touchmove') {
          touchEvent = getTouchById(nativeEvent, activePointerId);
          if (touchEvent === null) {
            return;
          }
          state.touchEvent = touchEvent;
        }

        if (isPressed) {
          const onPressMove = props.onPressMove;

          if (isFunction(onPressMove)) {
            dispatchEvent(
              event,
              onPressMove,
              context,
              state,
              'pressmove',
              UserBlockingEvent,
            );
          }
        } else {
          dispatchPressStartEvents(event, context, props, state);
        }
        break;
      }

      // END
      case 'pointerup':
      case 'keyup':
      case 'mouseup':
      case 'touchend': {
        if (isPressed) {
          const buttons = nativeEvent.buttons;
          let isKeyboardEvent = false;
          let touchEvent;
          if (type === 'pointerup' && activePointerId !== pointerId) {
            return;
          } else if (type === 'touchend') {
            touchEvent = getTouchById(nativeEvent, activePointerId);
            if (touchEvent === null) {
              return;
            }
            state.touchEvent = touchEvent;
            target = getTouchTarget(context, touchEvent);
          } else if (type === 'keyup') {
            // Ignore unrelated keyboard events
            if (!isValidKeyboardEvent(nativeEvent)) {
              return;
            }
            isKeyboardEvent = true;
            removeRootEventTypes(context, state);
          } else if (buttons === 4) {
            // Remove the root events here as no 'click' event is dispatched when this 'button' is pressed.
            removeRootEventTypes(context, state);
          }

          // Determine whether to call preventDefault on subsequent native events.
          if (
            context.isTargetWithinResponder(target) &&
            context.isTargetWithinHostComponent(target, 'a')
          ) {
            const {
              altKey,
              ctrlKey,
              metaKey,
              shiftKey,
            } = (nativeEvent: MouseEvent);
            // Check "open in new window/tab" and "open context menu" key modifiers
            const preventDefault = props.preventDefault;

            if (
              preventDefault !== false &&
              !shiftKey &&
              !metaKey &&
              !ctrlKey &&
              !altKey
            ) {
              state.shouldPreventClick = true;
            }
          }

          const pressTarget = state.pressTarget;
          dispatchPressEndEvents(event, context, props, state);
          const onPress = props.onPress;
          let isPressWithinResponderRegion = true;

          if (pressTarget !== null && isFunction(onPress)) {
            if (
              !isKeyboardEvent &&
              pressTarget !== null &&
              !targetIsDocument(pressTarget)
            ) {
              if (context.isTargetWithinNode(target, pressTarget)) {
                if (pointerType !== 'mouse') {
                  const {
                    left,
                    right,
                    top,
                    bottom,
                  } = (pressTarget: any).getBoundingClientRect();
                  const finalEvent: any =
                    type === 'touchend'
                      ? getTouchById(nativeEvent, activePointerId)
                      : event.nativeEvent;
                  const {clientX, clientY} = finalEvent;

                  isPressWithinResponderRegion =
                    left != null &&
                    right != null &&
                    top != null &&
                    bottom != null &&
                    clientX != null &&
                    clientY != null &&
                    (clientX >= left &&
                      clientX <= right &&
                      clientY >= top &&
                      clientY <= bottom);
                }
              } else {
                isPressWithinResponderRegion = false;
              }
            }

            if (isPressWithinResponderRegion && buttons !== 4) {
              dispatchEvent(
                event,
                onPress,
                context,
                state,
                'press',
                DiscreteEvent,
              );
            }
          }
          state.touchEvent = null;
        } else if (type === 'mouseup') {
          state.ignoreEmulatedMouseEvents = false;
        }
        break;
      }

      case 'click': {
        // "keyup" occurs after "click"
        if (previousPointerType !== 'keyboard') {
          removeRootEventTypes(context, state);
        }
        break;
      }

      // CANCEL
      case 'scroll': {
        // We ignore incoming scroll events when using mouse events
        if (previousPointerType === 'mouse') {
          return;
        }
        const pressTarget = state.pressTarget;
        const scrollTarget = nativeEvent.target;
        const doc = context.getActiveDocument();
        // If the scroll target is the document or if the press target
        // is inside the scroll target, then this a scroll that should
        // trigger a cancel.
        if (
          pressTarget !== null &&
          (scrollTarget === doc ||
            context.isTargetWithinNode(pressTarget, scrollTarget))
        ) {
          dispatchCancel(event, context, props, state);
        }
        break;
      }
      case 'pointercancel':
      case 'touchcancel':
      case 'dragstart': {
        dispatchCancel(event, context, props, state);
      }
    }
  },
  onUnmount(
    context: ReactDOMResponderContext,
    props: PressProps,
    state: PressState,
  ) {
    unmountResponder(context, props, state);
  },
};

export const PressResponder = React.unstable_createResponder(
  'Press',
  pressResponderImpl,
);

export function usePressResponder(
  props: PressProps,
): ReactEventResponderListener<any, any> {
  return React.unstable_useResponder(PressResponder, props);
}
