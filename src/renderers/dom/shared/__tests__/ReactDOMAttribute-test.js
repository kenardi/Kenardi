/**
 * Copyright 2013-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 *
 * @emails react-core
 */

'use strict';

describe('ReactDOM unknown attribute', () => {
  var React;
  var ReactDOM;

  beforeEach(() => {
    jest.resetModules();
    React = require('react');
    ReactDOM = require('react-dom');
  });

  describe('unknown attributes', () => {
    it('removes unknown attributes with values null and undefined', () => {
      var el = document.createElement('div');
      spyOn(console, 'error');

      function testRemove(value) {
        ReactDOM.render(<div unknown="something" />, el);
        expect(el.firstChild.getAttribute('unknown')).toBe('something');
        expectDev(console.error.calls.count(0)).toBe(0);
        ReactDOM.render(<div unknown={value} />, el);
        expect(el.firstChild.hasAttribute('unknown')).toBe(false);
        expectDev(console.error.calls.count(0)).toBe(0);
        console.error.calls.reset();
      }

      testRemove(null);
      testRemove(undefined);
    });

    it('removes unknown attributes that were rendered but are now missing', () => {
      var el = document.createElement('div');
      spyOn(console, 'error');
      ReactDOM.render(<div unknown="something" />, el);
      expect(el.firstChild.getAttribute('unknown')).toBe('something');
      expectDev(console.error.calls.count(0)).toBe(0);
      ReactDOM.render(<div />, el);
      expect(el.firstChild.hasAttribute('unknown')).toBe(false);
      expectDev(console.error.calls.count(0)).toBe(0);
    });

    it('passes through strings to unknown attributes', () => {
      var el = document.createElement('div');
      spyOn(console, 'error');
      ReactDOM.render(<div unknown="something" />, el);
      expect(el.firstChild.getAttribute('unknown')).toBe('something');
      expectDev(console.error.calls.count(0)).toBe(0);
      ReactDOM.render(<div />, el);
      expect(el.firstChild.hasAttribute('unknown')).toBe(false);
      expectDev(console.error.calls.count(0)).toBe(0);
    });

    it('coerces unknown attributes to strings with numbers and booleans', () => {
      var el = document.createElement('div');
      spyOn(console, 'error');

      function testCoerceToString(value) {
        ReactDOM.render(<div unknown="something" />, el);
        expect(el.firstChild.getAttribute('unknown')).toBe('something');
        expectDev(console.error.calls.count(0)).toBe(0);
        ReactDOM.render(<div unknown={value} />, el);
        expect(el.firstChild.getAttribute('unknown')).toBe(value + '');
        expectDev(console.error.calls.count(0)).toBe(0);
        console.error.calls.reset();
      }

      testCoerceToString(0);
      testCoerceToString(-1);
      testCoerceToString(42);
      testCoerceToString(9000.99999);
      // TODO: either change what we expect here or update the implementation
      // so that these pass -
      //
      // testCoerceToString(true);
      // testCoerceToString(false);
    });

    // TODO: get this test passing
    xit(
      'coerces unknown attributes to strings **and warns** with NaN, symbols, functions, and objects',
      () => {
        var el = document.createElement('div');
        spyOn(console, 'error');

        function testCoerceToString(value) {
          ReactDOM.render(<div unknown="something" />, el);
          expect(el.firstChild.getAttribute('unknown')).toBe('something');
          expectDev(console.error.calls.count(0)).toBe(0);
          ReactDOM.render(<div unknown={value} />, el);
          expect(el.firstChild.getAttribute('unknown')).toBe(value + '');
          expectDev(console.error.calls.count(0)).toBe(1);
          // TODO: add specific expectations about what the warning says
          // expectDev(normalizeCodeLocInfo(console.error.calls.argsFor(0)[0])).toBe(...
          console.error.calls.reset();
        }

        // TODO: this does not warn. We think it should.
        testCoerceToString(NaN);

        // TODO: either change what we expect or change our implementation
        // this throws "TypeError: Cannot convert a Symbol value to a string"
        // testCoerceToString(Symbol('foo'));

        // TODO: either change what we expect or change our implementation
        // this does not set it to the stringified function.
        testCoerceToString(() => 'foo');

        // TODO: this does not warn. We think it should.
        testCoerceToString({hello: 'world'});
      },
    );
  });
});
