// This is a testing playground for our lint rules.

// 1. Run yarn && yarn start
// 2. Open this folder as the project root in VSCode with ESLint extension
// 3. Changes to the rule code should get picked up without restarting ESLint server

function Foo() {
  if (condition) {
    useEffect(() => {});
  }
}
