# Agent notes

## Vendored repositories

`repos/` holds external repositories vendored as squashed git subtrees. They
are read-only reference material, not part of the app.

- Prefer patterns from the vendored source over guesses or web search results.
- Don't edit files under `repos/` unless explicitly asked.
- Don't import from `repos/`; app code uses the normal package dependencies.

### Effect (`repos/effect/`)

Pinned to the `effect@4.0.1` tag to match the installed `effect` package.

- Read `repos/effect/LLMS.md` before writing any Effect code.
- Treat `repos/effect/` as the source of truth for Effect patterns: check its
  source, tests, and module structure for idiomatic usage and API design.

Update it with the installed version (replace the tag):

```sh
git subtree pull --prefix=repos/effect https://github.com/Effect-TS/effect.git effect@<version> --squash
```

### Foldkit (`repos/foldkit/`)

Pinned to the `foldkit@0.166.0` tag to match `web/`'s installed `foldkit`.
The 7-day `minimumReleaseAge` in `bunfig.toml` decides which release can be
installed, so upgrade to the newest release at least a week old.

- Read `web/FOLDKIT.md` before writing frontend code. Foldkit owns that file;
  replace it whole from
  `repos/foldkit/packages/create-foldkit-app/templates/base/FOLDKIT.md` after an
  upgrade.
- `repos/foldkit/examples/` and `repos/foldkit/packages/typing-game/` are the
  quality bar.

Update it with the installed version:

```sh
git subtree pull --prefix=repos/foldkit https://github.com/foldkit/foldkit.git foldkit@<version> --squash
```

## Frontend (`web/`)

Before finishing a frontend change, run all four from `web/`:
`bun run format`, `bun run lint`, `bun run typecheck`, `bun run test`.

### Pleat (`vendor/pleat/`)

The frontend's styles use [Pleat](https://github.com/Manzanita-Research/pleat),
which is not published to npm. It is vendored as a git subtree pinned to
commit `7d579dcd63`, and `@pleat/core` and `@pleat/foldkit` are Bun workspace
members read from source through their `@pleat/source` export condition (see
`web/vite.config.ts`, `web/vitest.config.ts`, `web/tsconfig.json`). Unlike
`repos/`, the app imports this code.

- This bypasses the 7-day release-age rule in `bunfig.toml`; review the diff
  before pulling a new commit.
- The root `overrides` pins `foldkit` to `web/`'s version, because Pleat's
  dev dependencies ask for a newer one.
- Web tests run in Node rather than happy-dom: happy-dom's stylesheets lack
  the cascade layers Pleat inserts rules into.

```sh
git subtree pull --prefix=vendor/pleat https://github.com/Manzanita-Research/pleat.git <commit> --squash
```
