# Minimal repro: `RSC entry state not found`

## Symptom

`rsbuild build` (and `rsbuild dev`) with TanStack Start's `rsc.enabled: true`
fails with:

```text
error   Failed to build.
error     × RSC entry state not found for entry "my-worker" (compiler ID: 0).
```

Originates from `crates/rspack_plugin_rsc/src/server_plugin.rs` in
`@rspack/binding`. Fires during the server plugin's
`complete_client_entries_compilation` transition when iterating client
entries: the worker entry name exists but no RSC state was registered for it.

## How to reproduce

```sh
pnpm install
pnpm build:rsbuild
# or
pnpm dev:rsbuild
```

Both commands fail with the entry-state error.

## The repro is three things

### 1. `rsc.enabled: true` in the rsbuild plugin config:

```ts
plugins: [
  pluginReact(),
  tanstackStart({ rsc: { enabled: true } }),
]
```

### 2. A route that spawns a worker with a `webpackChunkName` magic comment

[`src/routes/worker-bug.tsx`](./src/routes/worker-bug.tsx):

```tsx
new Worker(
  /* webpackChunkName: "my-worker" */ new URL(
    './-worker/spawn.js',
    import.meta.url,
  ),
)
```

### 3. The worker source imports an external npm package

[`src/routes/-worker/spawn.js`](./src/routes/-worker/spawn.js):

```js
import * as clsx from 'clsx'

self.onmessage = (event) => {
  const tag = (clsx.default ?? clsx)('echo')
  self.postMessage(`${tag}: ${event.data}`)
}
```

`clsx` is just the smallest example — any real npm package works.

## What each piece contributes

| Variation                                                  | Build                            |
| ---------------------------------------------------------- | -------------------------------- |
| Baseline (all three above)                                 | ❌ FAILS with entry-state error  |
| Remove `webpackChunkName` magic comment                    | ✅ passes                        |
| Remove the `import * as clsx from 'clsx'` line             | ✅ passes                        |
| `tanstackStart({ rsc: { enabled: false } })`               | ✅ passes                        |

So the minimum trigger is:

- `new Worker(new URL(spec, import.meta.url))` with a `webpackChunkName`
  magic comment (registers a named worker entry in rspack's `WorkerPlugin`).
- The worker source imports at least one external npm package (adds a
  vendor edge to the worker chunk).
- `rsc.enabled: true` in the rsbuild plugin (activates the RSC
  `ServerPlugin` from `utils.rspack.experiments.rsc.createPlugins()`).

What is **not** required:

- `'use client'` directive
- `import 'client-only'`
- A renamed `Worker` identifier (`import { X as Worker }`)
- A workspace package with `sideEffects: false`
- A `createServerFn(...).handler(...)` reaching the worker
- An RSC server component (`renderServerComponent(...)`)
- Multiple routes / scale

## Root cause hypothesis

When rspack parses `new Worker(new URL(...))` with a `webpackChunkName`, the
`WorkerPlugin` registers a named worker child entry. The RSC `ServerPlugin`
(via the coordinator binding) records a per-entry state slot keyed by that
name. The worker's npm import pulls vendor code into the worker chunk —
which is enough to cause rspack's chunk splitter / tree-shaker to drop the
worker chunk from the final client chunk graph while leaving the entry-state
slot intact in the RSC plugin's internal state.

When the server plugin then iterates client entries during
`complete_client_entries_compilation`, the orphaned entry name has no RSC
state, and rspack throws.

## Suggested fix

`crates/rspack_plugin_rsc/src/server_plugin.rs` should treat missing RSC
entry state for worker-derived child entries as non-fatal — workers are
browser-only and don't carry React component manifests, so a per-entry RSC
manifest isn't applicable to them.

## Workarounds (all non-ideal)

1. **Remove `webpackChunkName`** from the `new Worker(new URL(...))` call.
   The worker chunk gets an anonymous numeric id and the entry-state lookup
   doesn't fire.
2. **Inline the worker source's external imports** — bundle the npm
   dependency into the worker file by hand so it has no external imports.
3. **Load the worker as a static asset** rather than via the
   `new Worker(new URL(...))` pattern. Bundle the worker separately and
   reference its URL directly. Bypasses rspack's WorkerPlugin entirely.
