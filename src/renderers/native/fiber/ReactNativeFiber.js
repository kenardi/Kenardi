/**
 * Copyright 2013-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 *
 * @providesModule ReactNativeFiber
 * @flow
 */

'use strict';

import type { Fiber } from 'ReactFiber';
import type { HostChildren } from 'ReactFiberReconciler';
var ReactNativeFeatureFlags = require('ReactNativeFeatureFlags');
var ReactFiberReconciler = require('ReactFiberReconciler');
var ReactNativeComponentTree = require('ReactNativeComponentTree');
var ReactNativeTagHandles = require('ReactNativeTagHandles');
var ReactNativeInjection = require('ReactNativeInjection');
var ReactNativeContainerInfo = require('ReactNativeContainerInfo');
var ReactNativeAttributePayload = require('ReactNativeAttributePayload');
var UIManager = require('UIManager');
var findNodeHandle = require('findNodeHandle');
var warning = require('warning');

var { precacheFiberNode } = ReactNativeComponentTree;

ReactNativeInjection.inject();

findNodeHandle._injectFiber(function(fiber: Fiber) {
  const inst = NativeRenderer.findHostInstance(fiber);
  return inst ? inst._rootNodeID : null;
});

type Container = {
  children: Array<number>;
  _tag: number;
};

type Props = { [key: any]: any };

type Instance = {
  _rootNodeID: number;
  children: Array<number>;
  child: ?number;
};
type TextInstance = {
  _rootNodeID: number;
};

function recursivelyAppendChildren(parent : Instance, child : HostChildren<Instance | TextInstance>) {
  if (!child) {
    return;
  }
  if (typeof child._rootNodeID === 'number') {
    parent.children.push(child._rootNodeID);
  } else {
    /* As a result of the refinement issue this type isn't known. */
    let node : any = child;
    do {
      recursivelyAppendChildren(parent, node.output);
    } while (node = node.sibling);
  }
}

var NativeRenderer = ReactFiberReconciler({

  updateContainer(container: Container, children : HostChildren<Instance | TextInstance>) : void {
    const tempNode = { _rootNodeID: 0, children: [] };
    recursivelyAppendChildren(tempNode, children);
    const shouldUpdate = !(
      container.children.length === tempNode.children.length && container.children.every((tag, i) => tempNode.children[i] === tag)
    );
    if (shouldUpdate) {
      container.children = tempNode.children;
      // TODO: what if some views only was moved?
      UIManager.removeSubviewsFromContainerWithID(container._tag);
      UIManager.setChildren(container._tag, tempNode.children);
    }
  },

  createInstance(
    type : string,
    props : Props,
    children : HostChildren<Instance | TextInstance>,
    internalInstanceHandle : Object
  ) : Instance {
    const { viewConfig } = internalInstanceHandle.return.type;
    const root = 1; // HACK
    const node = {
      _rootNodeID: ReactNativeTagHandles.allocateTag(),
      children: [],
      child: null,
    };
    precacheFiberNode(internalInstanceHandle, node._rootNodeID);

    const attributes = ReactNativeAttributePayload.create(
      props,
      viewConfig.validAttributes
    );
    UIManager.createView(node._rootNodeID, type, root, attributes);

    if (typeof props.children === 'string' || typeof props.children === 'number') {
      // create text node
      const textTag = ReactNativeTagHandles.allocateTag();
      const text = '' + props.children;
      UIManager.createView(textTag, 'RCTRawText', root, { text: text });
      node.child = textTag;
      node.children.push(textTag);
    } else {
      recursivelyAppendChildren(node, children);
    }
    UIManager.setChildren(node._rootNodeID, node.children.slice());
    return node;
  },

  prepareUpdate(
    node : Instance,
    oldProps : Props,
    newProps : Props
  ) : boolean {
    return true;
  },

  commitUpdate(node : Instance, oldProps : Props, newProps : Props, internalInstanceHandle: Object) : void {
    var root = 1; // HACK
    const { viewConfig } = internalInstanceHandle.return.type;
    const oldChildren = oldProps.children;
    const newChildren = newProps.children;
    if (typeof oldChildren === 'string' || typeof oldChildren === 'number') {
      const textTag = node.child;
      if (typeof newChildren === 'string' || typeof newChildren === 'number') {
        // singlechild -> singlechild
        UIManager.updateView(textTag, 'RCTRawText', { text: '' + newChildren });
      } else if (textTag) {
        // singlechild -> multichild
        const index = node.children.indexOf(textTag);
        UIManager.manageChildren(node._rootNodeID, [], [], [], [], [index]);
        node.children.splice(index, 1);
        node.child = null;
      }
    } else if (
      typeof newChildren === 'string' ||
      typeof newChildren === 'number') {
      // multichild -> singlechild
      const textTag = ReactNativeTagHandles.allocateTag();
      const text = '' + newChildren;
      UIManager.createView(textTag, 'RCTRawText', root, { text: text });
      node.child = textTag;
      node.children.push(textTag);
      UIManager.setChildren(node._rootNodeID, node.children.slice());
    }

    const updatePayload = ReactNativeAttributePayload.diff(
      oldProps,
      newProps,
      viewConfig.validAttributes
    );
    if (updatePayload) {
      UIManager.updateView(
        node._rootNodeID,
        viewConfig.uiViewClassName,
        updatePayload
      );
    }
  },

  createTextInstance(text: string, internalInstanceHandle : Object) : TextInstance {
    const root = 1; // HACK
    const node : TextInstance = {
      _rootNodeID: ReactNativeTagHandles.allocateTag(),
    };
    precacheFiberNode(internalInstanceHandle, node._rootNodeID);
    UIManager.createView(node._rootNodeID, 'RCTRawText', root, { text: text });
    return node;
  },

  commitTextUpdate(textInstance : TextInstance, oldText : string, newText : string) : void {
    if (oldText !== newText) {
      UIManager.updateView(
        textInstance._rootNodeID,
        'RCTRawText',
        { text: newText }
      );
    }
  },

  appendChild(parentInstance : Instance, child : Instance | TextInstance) : void {
    parentInstance.children.push(child._rootNodeID);
    UIManager.manageChildren(
      parentInstance._rootNodeID,
      [],
      [],
      [child._rootNodeID],
      [parentInstance.children.length - 1 ],
      []
    );
  },

  insertBefore(
    parentInstance : Instance,
    child : Instance | TextInstance,
    beforeChild : Instance | TextInstance
  ) : void {
    console.log('insert before');
  },

  removeChild(parentInstance : Instance, child : Instance | TextInstance) : void {
    const childIndex = parentInstance.children.indexOf(child._rootNodeID);
    parentInstance.children.splice(childIndex, 1);
    UIManager.manageChildren(
      parentInstance._rootNodeID,
      [],
      [],
      [],
      [],
      [childIndex]
    );
  },

  scheduleAnimationCallback: global.requestAnimationFrame,

  scheduleDeferredCallback: global.requestIdleCallback,

  useSyncScheduling: true,

});

var warned = false;

function warnAboutUnstableUse() {
  // Ignore this warning is the feature flag is turned on. E.g. for tests.
  warning(
    warned || ReactNativeFeatureFlags.useFiber,
    'You are using React DOM Fiber which is an experimental renderer. ' +
    'It is likely to have bugs, breaking changes and is unsupported.'
  );
  warned = true;
}

var _instancesByContainerID = {};

var ReactNative = {

  render(element : ReactElement<any>, containerTag : number, callback: ?Function) {
    warnAboutUnstableUse();
    if (!ReactNativeTagHandles.reactTagIsNativeTopRootID(containerTag)) {
      console.error('You cannot render into anything but a top root');
      return null;
    }

    ReactNativeTagHandles.assertRootTag(containerTag);

    let root;
    if (!_instancesByContainerID[containerTag]) {
      root = NativeRenderer.mountContainer(
        element,
        ReactNativeContainerInfo(containerTag),
        callback
      );
    } else {
      NativeRenderer.updateContainer(
        element,
        root = _instancesByContainerID[containerTag],
        callback
      );
    }
    // console.log(root);
    // is this correct?
    _instancesByContainerID[containerTag] = root;

    return NativeRenderer.getPublicRootInstance(root);
  },

  unmountComponentAtNode(containerTag : number) {
    warnAboutUnstableUse();
    const root = _instancesByContainerID[containerTag];
    _instancesByContainerID[containerTag] = null;
    if (root) {
      NativeRenderer.unmountContainer(root);
    }
  },

  findNodeHandle: findNodeHandle,

  unstable_batchedUpdates<A>(fn : () => A) : A {
    return NativeRenderer.batchedUpdates(fn);
  },

};

module.exports = ReactNative;
