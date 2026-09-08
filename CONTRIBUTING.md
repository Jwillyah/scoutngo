# Contributing

Small project, simple rules.

## Bring your own key

There is no shared key and no hosted backend to develop against. Copy
`.env.example` to `.env` and put your own Anthropic API key in it. `.env` is
gitignored. Never commit a key, and never paste one into an issue or a PR.

Most of the app runs without a key. Only plan generation needs one.

## Run the tests before opening a PR

```sh
npm install
npm test
npm run lint
npm run build
```

All three should pass. New behaviour in `src/core/` needs a test. If you fix a
bug, add the failing case first.

## Never move geometry into a model prompt

This is the one hard rule.

Sun position, azimuth, bearings, lighting classification, field of view, and
distance are computed in `src/core/` by pure functions with tests. Do not ask
the model to calculate them, do not ask it to check them, and do not let its
output override them.

The model proposes positions and shots. Code computes the numbers and labels
them. A PR that asks the model to work out which way the sun is will be closed,
because that is the exact failure this project was built to fix.

If you find yourself writing "and tell me whether this position is backlit" into
a prompt, the answer belongs in `src/core/lighting.ts` instead.
