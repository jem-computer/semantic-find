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
