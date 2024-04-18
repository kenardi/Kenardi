
## Input

```javascript
function Foo(props) {
  const onFoo = useCallback(
    (reason) => {
      log(props.router.location);
    },
    [props.router.location]
  );

  return onFoo;
}

```

## Code

```javascript
import { unstable_useMemoCache as useMemoCache } from "react";
function Foo(props) {
  const $ = useMemoCache(2);
  let t0;
  if ($[0] !== props.router.location) {
    t0 = (reason) => {
      log(props.router.location);
    };
    $[0] = props.router.location;
    $[1] = t0;
  } else {
    t0 = $[1];
  }
  const onFoo = t0;
  return onFoo;
}

```
      