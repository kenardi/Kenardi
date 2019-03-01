/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @emails react-core
 */

let React;
let ReactDOM;
let ReactTestUtils;
let act;

jest.useRealTimers();

function sleep(period) {
  return new Promise(resolve => {
    setTimeout(() => {
      resolve(true);
    }, period);
  });
}

describe('ReactTestUtils.act()', () => {
  beforeEach(() => {
    jest.resetModules();
    React = require('react');
    ReactDOM = require('react-dom');
    ReactTestUtils = require('react-dom/test-utils');
    act = ReactTestUtils.act;
  });

  describe('sync', () => {
    it('can use act to flush effects', () => {
      function App(props) {
        React.useEffect(props.callback);
        return null;
      }

      let called = false;
      act(() => {
        ReactDOM.render(
          <App
            callback={() => {
              called = true;
            }}
          />,
          document.createElement('div'),
        );
      });

      expect(called).toBe(true);
    });

    it('flushes effects on every call', () => {
      function App(props) {
        let [ctr, setCtr] = React.useState(0);
        React.useEffect(() => {
          props.callback(ctr);
        });
        return (
          <button id="button" onClick={() => setCtr(x => x + 1)}>
            {ctr}
          </button>
        );
      }

      const container = document.createElement('div');
      // attach to body so events works
      document.body.appendChild(container);
      let calledCtr = 0;
      act(() => {
        ReactDOM.render(
          <App
            callback={val => {
              calledCtr = val;
            }}
          />,
          container,
        );
      });
      const button = document.getElementById('button');
      function click() {
        button.dispatchEvent(new MouseEvent('click', {bubbles: true}));
      }

      act(() => {
        click();
        click();
        click();
      });
      expect(calledCtr).toBe(3);
      act(click);
      expect(calledCtr).toBe(4);
      act(click);
      expect(calledCtr).toBe(5);
      expect(button.innerHTML).toBe('5');

      document.body.removeChild(container);
    });

    it('should flush effects recursively', () => {
      function App() {
        let [ctr, setCtr] = React.useState(0);
        React.useEffect(() => {
          if (ctr < 5) {
            setCtr(x => x + 1);
          }
        });
        return ctr;
      }

      const container = document.createElement('div');
      act(() => {
        ReactDOM.render(<App />, container);
      });

      expect(container.innerHTML).toBe('5');
    });

    it('detects setState being called outside of act(...)', () => {
      let setValue = null;
      function App() {
        let [value, _setValue] = React.useState(0);
        setValue = _setValue;
        return (
          <button id="button" onClick={() => setValue(2)}>
            {value}
          </button>
        );
      }
      const container = document.createElement('div');
      document.body.appendChild(container);
      let button;
      act(() => {
        ReactDOM.render(<App />, container);
        button = container.querySelector('#button');
        button.dispatchEvent(new MouseEvent('click', {bubbles: true}));
      });
      expect(button.innerHTML).toBe('2');
      expect(() => setValue(1)).toWarnDev([
        'An update to App inside a test was not wrapped in act(...).',
      ]);
      document.body.removeChild(container);
    });
    describe('fake timers', () => {
      beforeEach(() => {
        jest.useFakeTimers();
      });
      afterEach(() => {
        jest.useRealTimers();
      });
      it('lets a ticker update', () => {
        function App() {
          let [toggle, setToggle] = React.useState(0);
          React.useEffect(() => {
            let timeout = setTimeout(() => {
              setToggle(1);
            }, 200);
            return () => clearTimeout(timeout);
          }, []);
          return toggle;
        }
        const container = document.createElement('div');

        act(() => {
          ReactDOM.render(<App />, container);
        });
        act(() => {
          jest.runAllTimers();
        });

        expect(container.innerHTML).toBe('1');
      });
    });

    it('warns if you return a value inside act', () => {
      expect(() => act(() => null)).toWarnDev(
        [
          'The callback passed to act(...) function must return undefined, or a Promise.',
        ],
        {withoutStack: true},
      );
      expect(() => act(() => 123)).toWarnDev(
        [
          'The callback passed to act(...) function must return undefined, or a Promise.',
        ],
        {withoutStack: true},
      );
    });

    it('warns if you try to await an .act call', () => {
      expect(act(() => {}).then).toWarnDev(
        [
          'Do not await the result of calling act(...) with sync logic, it is not a Promise.',
        ],
        {withoutStack: true},
      );
    });
  });
  describe('asynchronous tests', () => {
    it('can handle timers', async () => {
      function App() {
        let [ctr, setCtr] = React.useState(0);
        function doSomething() {
          setTimeout(() => {
            setCtr(1);
          }, 200);
        }

        React.useEffect(() => {
          doSomething();
        }, []);
        return ctr;
      }
      const el = document.createElement('div');
      await act(async () => {
        act(() => {
          ReactDOM.render(<App />, el);
        });

        await sleep(500);
        expect(el.innerHTML).toBe('1');
      });
    });

    it('can handle async/await', async () => {
      function App() {
        let [ctr, setCtr] = React.useState(0);
        async function someAsyncFunction() {
          await null;
          setCtr(1);
        }
        React.useEffect(() => {
          someAsyncFunction();
        }, []);
        return ctr;
      }
      const el = document.createElement('div');

      await act(async () => {
        act(() => {
          ReactDOM.render(<App />, el);
        });
        // pending promises will close before this ends
      });
      expect(el.innerHTML).toEqual('1');
    });

    it('warns if you do not await an act call', async () => {
      spyOnDevAndProd(console, 'error');
      act(async () => {});
      // it's annoying that we have to wait a tick before this warning comes in
      await sleep(0);
      if (__DEV__) {
        expect(console.error).toHaveBeenCalledTimes(1);
      }
    });

    it('warns if you try to interleave multiple act calls', async () => {
      spyOnDevAndProd(console, 'error');
      // let's try to cheat and spin off a 'thread' with an act call
      (async () => {
        await act(async () => {
          await sleep(200);
        });
      })();

      await act(async () => {
        await sleep(500);
      });

      await sleep(600);
      if (__DEV__) {
        expect(console.error).toHaveBeenCalledTimes(1);
      }
    });

    it('commits and effects are guaranteed to be flushed', async () => {
      function App(props) {
        let [state, setState] = React.useState(0);
        async function something() {
          await null;
          setState(1);
        }
        React.useEffect(() => {
          something();
        }, []);
        React.useEffect(() => {
          props.callback();
        });
        return state;
      }
      let ctr = 0;
      const div = document.createElement('div');

      await act(async () => {
        act(() => {
          ReactDOM.render(<App callback={() => ctr++} />, div);
        });
        expect(div.innerHTML).toBe('0');
        expect(ctr).toBe(1);
      });
      // this may seem odd, but it matches user behaviour -
      // a flash of "0" followed by "1"

      expect(div.innerHTML).toBe('1');
      expect(ctr).toBe(2);
    });

    it('propagates errors', async () => {
      let err;
      try {
        await act(async () => {
          throw new Error('some error');
        });
      } catch (_err) {
        err = _err;
      } finally {
        expect(err instanceof Error).toBe(true);
        expect(err.message).toBe('some error');
      }
    });
  });
});
