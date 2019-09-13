/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

import type {AnyNativeEvent} from 'legacy-events/PluginModuleType';
import type {Container, SuspenseInstance} from '../client/ReactDOMHostConfig';
import type {DOMTopLevelEventType} from 'legacy-events/TopLevelEventTypes';
import type {EventSystemFlags} from 'legacy-events/EventSystemFlags';

import {enableFlareAPI} from 'shared/ReactFeatureFlags';
import {
  unstable_scheduleCallback as scheduleCallback,
  unstable_NormalPriority as NormalPriority,
} from 'scheduler';
import {
  attemptToDispatchEvent,
  trapEventForResponderEventSystem,
} from './ReactDOMEventListener';
import {
  getListeningSetForElement,
  listenToTopLevel,
} from './ReactBrowserEventEmitter';
import {unsafeCastDOMTopLevelTypeToString} from 'legacy-events/TopLevelEventTypes';

// TODO: Upgrade this definition once we're on a newer version of Flow that
// has this definition built-in.
type PointerEvent = Event & {
  pointerId: number,
  relatedTarget: EventTarget | null,
};

import {
  TOP_MOUSE_DOWN,
  TOP_MOUSE_UP,
  TOP_TOUCH_CANCEL,
  TOP_TOUCH_END,
  TOP_TOUCH_START,
  TOP_AUX_CLICK,
  TOP_DOUBLE_CLICK,
  TOP_POINTER_CANCEL,
  TOP_POINTER_DOWN,
  TOP_POINTER_UP,
  TOP_DRAG_END,
  TOP_DRAG_START,
  TOP_DROP,
  TOP_COMPOSITION_END,
  TOP_COMPOSITION_START,
  TOP_KEY_DOWN,
  TOP_KEY_PRESS,
  TOP_KEY_UP,
  TOP_INPUT,
  TOP_TEXT_INPUT,
  TOP_CLOSE,
  TOP_CANCEL,
  TOP_COPY,
  TOP_CUT,
  TOP_PASTE,
  TOP_CLICK,
  TOP_CHANGE,
  TOP_CONTEXT_MENU,
  TOP_RESET,
  TOP_SUBMIT,
  TOP_DRAG_ENTER,
  TOP_DRAG_LEAVE,
  TOP_MOUSE_OVER,
  TOP_MOUSE_OUT,
  TOP_POINTER_OVER,
  TOP_POINTER_OUT,
  TOP_GOT_POINTER_CAPTURE,
  TOP_LOST_POINTER_CAPTURE,
  TOP_FOCUS,
  TOP_BLUR,
} from './DOMTopLevelEventTypes';
import {IS_REPLAYED} from 'legacy-events/EventSystemFlags';

type QueuedReplayableEvent = {|
  blockedOn: null | Container | SuspenseInstance,
  topLevelType: DOMTopLevelEventType,
  eventSystemFlags: EventSystemFlags,
  nativeEvent: AnyNativeEvent,
|};

let hasScheduledReplayAttempt = false;

// The queue of discrete events to be replayed.
let queuedDiscreteEvents: Array<QueuedReplayableEvent> = [];

// Indicates if any continuous event targets are non-null for early bailout.
let hasAnyQueuedContinuousEvents: boolean = false;
// The last of each continuous event type. We only need to replay the last one
// if the last target was dehydrated.
let queuedFocus: null | QueuedReplayableEvent = null;
let queuedDrag: null | QueuedReplayableEvent = null;
let queuedMouse: null | QueuedReplayableEvent = null;
// For pointer events there can be one latest event per pointerId.
let queuedPointers: Map<number, QueuedReplayableEvent> = new Map();
let queuedPointerCaptures: Map<number, QueuedReplayableEvent> = new Map();
// We could consider replaying selectionchange and touchmoves too.

export function hasQueuedDiscreteEvents(): boolean {
  return queuedDiscreteEvents.length > 0;
}

export function hasQueuedContinuousEvents(): boolean {
  return hasAnyQueuedContinuousEvents;
}

export function isReplayableDiscreteEvent(
  eventType: DOMTopLevelEventType,
): boolean {
  switch (eventType) {
    case TOP_MOUSE_DOWN:
    case TOP_MOUSE_UP:
    case TOP_TOUCH_CANCEL:
    case TOP_TOUCH_END:
    case TOP_TOUCH_START:
    case TOP_AUX_CLICK:
    case TOP_DOUBLE_CLICK:
    case TOP_POINTER_CANCEL:
    case TOP_POINTER_DOWN:
    case TOP_POINTER_UP:
    case TOP_DRAG_END:
    case TOP_DRAG_START:
    case TOP_DROP:
    case TOP_COMPOSITION_END:
    case TOP_COMPOSITION_START:
    case TOP_KEY_DOWN:
    case TOP_KEY_PRESS:
    case TOP_KEY_UP:
    case TOP_INPUT:
    case TOP_TEXT_INPUT:
    case TOP_CLOSE:
    case TOP_CANCEL:
    case TOP_COPY:
    case TOP_CUT:
    case TOP_PASTE:
    case TOP_CLICK:
    case TOP_CHANGE:
    case TOP_CONTEXT_MENU:
    case TOP_RESET:
    case TOP_SUBMIT:
      return true;
  }
  return false;
}

function trapReplayableEvent(
  topLevelType: DOMTopLevelEventType,
  document: Document,
  listeningSet: Set<DOMTopLevelEventType | string>,
) {
  listenToTopLevel(topLevelType, document, listeningSet);
  if (enableFlareAPI) {
    // Trap events for the responder system.
    const passiveEventKey =
      unsafeCastDOMTopLevelTypeToString(topLevelType) + '_passive';
    if (!listeningSet.has(passiveEventKey)) {
      trapEventForResponderEventSystem(document, topLevelType, true);
      listeningSet.add(passiveEventKey);
    }
    // TODO: This listens to all events as active which might have
    // undesirable effects. It's also unnecessary to have both
    // passive and active listeners. Instead, we could start with
    // a passive and upgrade it to an active one if needed.
    // For replaying purposes the active is never needed since we
    // currently don't preventDefault.
    const activeEventKey =
      unsafeCastDOMTopLevelTypeToString(topLevelType) + '_active';
    if (!listeningSet.has(activeEventKey)) {
      trapEventForResponderEventSystem(document, topLevelType, false);
      listeningSet.add(activeEventKey);
    }
  }
}

export function eagerlyTrapReplayableEvents(document: Document) {
  const listeningSet = getListeningSetForElement(document);
  // Discrete
  trapReplayableEvent(TOP_MOUSE_DOWN, document, listeningSet);
  trapReplayableEvent(TOP_MOUSE_UP, document, listeningSet);
  trapReplayableEvent(TOP_TOUCH_CANCEL, document, listeningSet);
  trapReplayableEvent(TOP_TOUCH_END, document, listeningSet);
  trapReplayableEvent(TOP_TOUCH_START, document, listeningSet);
  trapReplayableEvent(TOP_AUX_CLICK, document, listeningSet);
  trapReplayableEvent(TOP_DOUBLE_CLICK, document, listeningSet);
  trapReplayableEvent(TOP_POINTER_CANCEL, document, listeningSet);
  trapReplayableEvent(TOP_POINTER_DOWN, document, listeningSet);
  trapReplayableEvent(TOP_POINTER_UP, document, listeningSet);
  trapReplayableEvent(TOP_DRAG_END, document, listeningSet);
  trapReplayableEvent(TOP_DRAG_START, document, listeningSet);
  trapReplayableEvent(TOP_DROP, document, listeningSet);
  trapReplayableEvent(TOP_COMPOSITION_END, document, listeningSet);
  trapReplayableEvent(TOP_COMPOSITION_START, document, listeningSet);
  trapReplayableEvent(TOP_KEY_DOWN, document, listeningSet);
  trapReplayableEvent(TOP_KEY_PRESS, document, listeningSet);
  trapReplayableEvent(TOP_KEY_UP, document, listeningSet);
  trapReplayableEvent(TOP_INPUT, document, listeningSet);
  trapReplayableEvent(TOP_TEXT_INPUT, document, listeningSet);
  trapReplayableEvent(TOP_CLOSE, document, listeningSet);
  trapReplayableEvent(TOP_CANCEL, document, listeningSet);
  trapReplayableEvent(TOP_COPY, document, listeningSet);
  trapReplayableEvent(TOP_CUT, document, listeningSet);
  trapReplayableEvent(TOP_PASTE, document, listeningSet);
  trapReplayableEvent(TOP_CLICK, document, listeningSet);
  trapReplayableEvent(TOP_CHANGE, document, listeningSet);
  trapReplayableEvent(TOP_CONTEXT_MENU, document, listeningSet);
  trapReplayableEvent(TOP_RESET, document, listeningSet);
  trapReplayableEvent(TOP_SUBMIT, document, listeningSet);
  // Continuous
  trapReplayableEvent(TOP_FOCUS, document, listeningSet);
  trapReplayableEvent(TOP_BLUR, document, listeningSet);
  trapReplayableEvent(TOP_DRAG_ENTER, document, listeningSet);
  trapReplayableEvent(TOP_DRAG_LEAVE, document, listeningSet);
  trapReplayableEvent(TOP_MOUSE_OVER, document, listeningSet);
  trapReplayableEvent(TOP_MOUSE_OUT, document, listeningSet);
  trapReplayableEvent(TOP_POINTER_OVER, document, listeningSet);
  trapReplayableEvent(TOP_POINTER_OUT, document, listeningSet);
  trapReplayableEvent(TOP_GOT_POINTER_CAPTURE, document, listeningSet);
  trapReplayableEvent(TOP_LOST_POINTER_CAPTURE, document, listeningSet);
}

function createQueuedReplayableEvent(
  blockedOn: null | Container | SuspenseInstance,
  topLevelType: DOMTopLevelEventType,
  eventSystemFlags: EventSystemFlags,
  nativeEvent: AnyNativeEvent,
): QueuedReplayableEvent {
  return {
    blockedOn,
    topLevelType,
    eventSystemFlags: eventSystemFlags | IS_REPLAYED,
    nativeEvent,
  };
}

export function queueDiscreteEvent(
  blockedOn: null | Container | SuspenseInstance,
  topLevelType: DOMTopLevelEventType,
  eventSystemFlags: EventSystemFlags,
  nativeEvent: AnyNativeEvent,
): void {
  queuedDiscreteEvents.push(
    createQueuedReplayableEvent(
      blockedOn,
      topLevelType,
      eventSystemFlags,
      nativeEvent,
    ),
  );
  if (blockedOn === null && queuedDiscreteEvents.length === 1) {
    // This probably shouldn't happen but some defensive coding might
    // help us get unblocked if we have a bug.
    replayUnblockedEvents();
  }
}

// Resets the replaying for this type of continuous event to no event.
export function clearIfContinuousEvent(
  topLevelType: DOMTopLevelEventType,
  nativeEvent: AnyNativeEvent,
): void {
  switch (topLevelType) {
    case TOP_FOCUS:
    case TOP_BLUR:
      queuedFocus = null;
      break;
    case TOP_DRAG_ENTER:
    case TOP_DRAG_LEAVE:
      queuedDrag = null;
      break;
    case TOP_MOUSE_OVER:
    case TOP_MOUSE_OUT:
      queuedMouse = null;
      break;
    case TOP_POINTER_OVER:
    case TOP_POINTER_OUT: {
      let pointerId = ((nativeEvent: any): PointerEvent).pointerId;
      queuedPointers.delete(pointerId);
      break;
    }
    case TOP_GOT_POINTER_CAPTURE:
    case TOP_LOST_POINTER_CAPTURE: {
      let pointerId = ((nativeEvent: any): PointerEvent).pointerId;
      queuedPointerCaptures.delete(pointerId);
      break;
    }
  }
}

function accumulateOrCreateQueuedReplayableEvent(
  existingQueuedEvent: null | QueuedReplayableEvent,
  blockedOn: null | Container | SuspenseInstance,
  topLevelType: DOMTopLevelEventType,
  eventSystemFlags: EventSystemFlags,
  nativeEvent: AnyNativeEvent,
): QueuedReplayableEvent {
  if (
    existingQueuedEvent === null ||
    existingQueuedEvent.nativeEvent !== nativeEvent
  ) {
    return createQueuedReplayableEvent(
      blockedOn,
      topLevelType,
      eventSystemFlags,
      nativeEvent,
    );
  }
  // If we have already queued this exact event, then it's because
  // the different event systems have different DOM event listeners.
  // We can accumulate the flags and store a single event to be
  // replayed.
  existingQueuedEvent.eventSystemFlags |= eventSystemFlags;
  return existingQueuedEvent;
}

export function queueIfContinuousEvent(
  blockedOn: null | Container | SuspenseInstance,
  topLevelType: DOMTopLevelEventType,
  eventSystemFlags: EventSystemFlags,
  nativeEvent: AnyNativeEvent,
): boolean {
  // These set relatedTarget to null because the replayed event will be treated as if we
  // moved from outside the window (no target) onto the target once it hydrates.
  // Instead of mutating we could clone the event.
  switch (topLevelType) {
    case TOP_FOCUS: {
      const focusEvent = ((nativeEvent: any): FocusEvent);
      queuedFocus = accumulateOrCreateQueuedReplayableEvent(
        queuedFocus,
        blockedOn,
        topLevelType,
        eventSystemFlags,
        focusEvent,
      );
      return true;
    }
    case TOP_DRAG_ENTER: {
      const dragEvent = ((nativeEvent: any): DragEvent);
      queuedDrag = accumulateOrCreateQueuedReplayableEvent(
        queuedDrag,
        blockedOn,
        topLevelType,
        eventSystemFlags,
        dragEvent,
      );
      return true;
    }
    case TOP_MOUSE_OVER: {
      const mouseEvent = ((nativeEvent: any): MouseEvent);
      queuedMouse = accumulateOrCreateQueuedReplayableEvent(
        queuedMouse,
        blockedOn,
        topLevelType,
        eventSystemFlags,
        mouseEvent,
      );
      return true;
    }
    case TOP_POINTER_OVER: {
      const pointerEvent = ((nativeEvent: any): PointerEvent);
      const pointerId = pointerEvent.pointerId;
      queuedPointers.set(
        pointerId,
        accumulateOrCreateQueuedReplayableEvent(
          queuedPointers.get(pointerId) || null,
          blockedOn,
          topLevelType,
          eventSystemFlags,
          pointerEvent,
        ),
      );
      return true;
    }
    case TOP_GOT_POINTER_CAPTURE: {
      const pointerEvent = ((nativeEvent: any): PointerEvent);
      const pointerId = pointerEvent.pointerId;
      queuedPointerCaptures.set(
        pointerId,
        accumulateOrCreateQueuedReplayableEvent(
          queuedPointerCaptures.get(pointerId) || null,
          blockedOn,
          topLevelType,
          eventSystemFlags,
          pointerEvent,
        ),
      );
      return true;
    }
  }
  return false;
}

function attemptReplayQueuedEvent(queuedEvent: QueuedReplayableEvent): boolean {
  if (queuedEvent.blockedOn !== null) {
    return false;
  }
  let nextBlockedOn = attemptToDispatchEvent(
    queuedEvent.topLevelType,
    queuedEvent.eventSystemFlags,
    queuedEvent.nativeEvent,
  );
  if (nextBlockedOn !== null) {
    // We're still blocked. Try again later.
    queuedEvent.blockedOn = nextBlockedOn;
    return false;
  }
  return true;
}

function attemptReplayQueuedEventInMap(
  queuedEvent: QueuedReplayableEvent,
  key: number,
  map: Map<number, QueuedReplayableEvent>,
): void {
  if (attemptReplayQueuedEvent(queuedEvent)) {
    map.delete(key);
  }
}

function replayUnblockedEvents() {
  hasScheduledReplayAttempt = false;
  // First replay discrete events.
  while (queuedDiscreteEvents.length > 0) {
    let nextDiscreteEvent = queuedDiscreteEvents[0];
    if (nextDiscreteEvent.blockedOn !== null) {
      // We're still blocked.
      break;
    }
    let nextBlockedOn = attemptToDispatchEvent(
      nextDiscreteEvent.topLevelType,
      nextDiscreteEvent.eventSystemFlags,
      nextDiscreteEvent.nativeEvent,
    );
    if (nextBlockedOn !== null) {
      // We're still blocked. Try again later.
      nextDiscreteEvent.blockedOn = nextBlockedOn;
    } else {
      // We've successfully replayed the first event. Let's try the next one.
      queuedDiscreteEvents.shift();
    }
  }
  // Next replay any continuous events.
  if (queuedFocus !== null && attemptReplayQueuedEvent(queuedFocus)) {
    queuedFocus = null;
  }
  if (queuedDrag !== null && attemptReplayQueuedEvent(queuedDrag)) {
    queuedDrag = null;
  }
  if (queuedMouse !== null && attemptReplayQueuedEvent(queuedMouse)) {
    queuedMouse = null;
  }
  queuedPointers.forEach(attemptReplayQueuedEventInMap);
  queuedPointerCaptures.forEach(attemptReplayQueuedEventInMap);
}

function scheduleCallbackIfUnblocked(
  queuedEvent: QueuedReplayableEvent,
  unblocked: Container | SuspenseInstance,
) {
  if (queuedEvent.blockedOn === unblocked) {
    queuedEvent.blockedOn = null;
    if (!hasScheduledReplayAttempt) {
      hasScheduledReplayAttempt = true;
      // Schedule a callback to attempt replaying as many events as are
      // now unblocked. This first might not actually be unblocked yet.
      // We could check it early to avoid scheduling an unnecessary callback.
      scheduleCallback(NormalPriority, replayUnblockedEvents);
    }
  }
}

export function retryIfBlockedOn(
  unblocked: Container | SuspenseInstance,
): void {
  // Mark anything that was blocked on this as no longer blocked
  // and eligible for a replay.
  if (queuedDiscreteEvents.length > 0) {
    scheduleCallbackIfUnblocked(queuedDiscreteEvents[0], unblocked);
    // This is a exponential search for each boundary that commits. I think it's
    // worth it because we expect very few discrete events to queue up and once
    // we are actually fully unblocked it will be fast to replay them.
    for (let i = 1; i < queuedDiscreteEvents.length; i++) {
      let queuedEvent = queuedDiscreteEvents[i];
      if (queuedEvent.blockedOn === unblocked) {
        queuedEvent.blockedOn = null;
      }
    }
  }

  if (queuedFocus !== null) {
    scheduleCallbackIfUnblocked(queuedFocus, unblocked);
  }
  if (queuedDrag !== null) {
    scheduleCallbackIfUnblocked(queuedDrag, unblocked);
  }
  if (queuedMouse !== null) {
    scheduleCallbackIfUnblocked(queuedMouse, unblocked);
  }
  const unblock = queuedEvent =>
    scheduleCallbackIfUnblocked(queuedEvent, unblocked);
  queuedPointers.forEach(unblock);
  queuedPointerCaptures.forEach(unblock);
}
