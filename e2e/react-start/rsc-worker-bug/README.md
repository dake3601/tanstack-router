# Repros: rspack RSC + TanStack Start

Two distinct rsbuild build-time errors under
`tanstackStart({ rsc: { enabled: true } })`:

1. [`worker-bug.tsx`](./src/routes/worker-bug.tsx) — `RSC entry state not found`
   when a worker chunk with `webpackChunkName` imports an npm package.
   **Fixed in `@rspack/core` 2.0.4-canary-32cafdc6** (or later canary). With
   that version the worker spawns correctly; click "spawn worker" on the
   `/worker-bug` route and you should see `echo: hello from route`.
2. [`server-fn-bug.tsx`](./src/routes/server-fn-bug.tsx) — SWC
   `reactServerComponents` transform refuses `useEffect` inside the user's
   `router.tsx`. **Still active** on the canary used here.

## How to reproduce

```sh
pnpm install
pnpm build:rsbuild
# or
pnpm dev:rsbuild
```

The build dies on the `useEffect` error from bug 2. Comment out the import in
[`server-fn-bug.tsx`](./src/routes/server-fn-bug.tsx) and the build passes —
that confirms bug 1 no longer fires under the canary.

---

## Bug 2: SWC `reactServerComponents` rejects `useEffect` in `router.tsx`

### Symptom (bug 2)

```text
× Module build failed (from builtin:swc-loader):
  × You're importing a component that needs `useEffect`. This React Hook
    only works in a Client Component. To fix, mark the file (or its parent)
    with the `"use client"` directive.

src/router.tsx:2:1
import { useEffect } from 'react'
         ^^^^^^^^^

Import traces (entry → error):
  ../../../packages/react-start/dist/plugin/default-entry/server.ts
  ../../../packages/react-start/dist/esm/server.js
  ... (10 hidden)
  ../../../packages/start-server-core/dist/esm/createStartHandler.js
  ./src/router.tsx ×
```

### Minimal trigger

Three things:

1. **`router.tsx` imports a client-only React hook** (any of `useEffect`,
   `useState`, `useRef`, `useLayoutEffect`, ...).
2. **Some route module defines a `createServerFn(...).handler(...)` whose
   body imports anything from `@tanstack/react-start/server`** — `getRequest`,
   `defaultStreamHandler`, anything that lives behind the `react-server`
   conditional export.
3. **`tanstackStart({ rsc: { enabled: true } })`** in `rsbuild.config.ts`.

Remove any one piece and the build passes:

| Variation                                                                       | Build                            |
| ------------------------------------------------------------------------------- | -------------------------------- |
| Baseline (all three above)                                                      | ❌ FAILS with `useEffect` error  |
| `router.tsx` does not import `useEffect`                                        | ✅ passes                        |
| Handler body does not import from `@tanstack/react-start/server`                | ✅ passes                        |
| `tanstackStart({ rsc: { enabled: false } })`                                    | ✅ passes                        |

### Why router.tsx ends up in the RSC layer

Issuer chain walked back from the failing RSC-layer parse:

```text
chain[0]  src/router.tsx                                       |react-server-components
chain[1]  start-server-core/createStartHandler.js              |react-server-components
chain[2]  start-server-core/index.js                           |react-server-components
chain[3]  react-start/server.rsc.js                            |react-server-components
chain[4]  src/routes/server-fn-bug.tsx?tss-serverfn-split?rsc-server-entry-proxy=true |react-server-components
chain[5]  src/routes/server-fn-bug.tsx?tss-serverfn-split      |react-server-components   ← server-fn split body (RSC layer entry)
chain[6]  node_modules/.virtual/_tanstack-start-server-fn-resolver.js |server-side-rendering
chain[7]  start-server-core/getServerFnById.js                 |server-side-rendering
chain[8]  start-server-core/server-functions-handler.js        |server-side-rendering
chain[9]  start-server-core/createStartHandler.js              |server-side-rendering
chain[10] start-server-core/index.js                           |server-side-rendering
chain[11] react-start-server/index.js                          |server-side-rendering
chain[12] react-start/server.js                                |server-side-rendering
chain[13] react-start/default-entry/server.ts                  |server-side-rendering   ← SSR entry
```

1. SSR entry transitively loads the server-fn resolver virtual module,
   which imports every `?tss-serverfn-split` body. `start-plugin-core`'s
   rsbuild plugin places those bodies in the `react-server-components` layer.
2. The split body of `server-fn-bug.tsx` imports
   `@tanstack/react-start/server`. The issuerLayer rule adds the
   `react-server` resolve condition, so that subpath resolves to
   `react-start/dist/esm/server.rsc.js` instead of `server.js`.
3. `server.rsc.js` re-runs `start-server-core`'s exports under the
   `react-server` condition, producing a **second** instance of
   `createStartHandler.js` — this time in the RSC layer.
4. That second `createStartHandler.js` does
   `import('#tanstack-router-entry')`, aliased to the user's `src/router.tsx`.
   The import inherits the RSC layer from its issuer.
5. SWC's `reactServerComponents` transform now sees `router.tsx` and
   refuses the `useEffect` import.

The user never opted `router.tsx` into the RSC layer — it ends up there as
a side effect of `react-server`-conditional package exports threading
through the RSC subtree.

### Suggested fix

Either:

- **SWC transform**: skip `reactServerComponents` for modules reached only
  through `import('#tanstack-router-entry')` (and the other Start entry
  virtuals), or
- **`@tanstack/start-plugin-core`**: deduplicate `start-server-core` between
  layers so the `react-server`-conditional second pass does not pull
  `createStartHandler.js → router.tsx` along.

### Workaround

Add `'use client'` to `router.tsx`. The directive satisfies the SWC
transform; TanStack Start ignores it at runtime since `router.tsx` is the
server's `getRouter` factory.

---

## Bug 1: `RSC entry state not found` (fixed in rspack canary)

### Symptom (bug 1)

```text
error   Failed to build.
error     × RSC entry state not found for entry "my-worker" (compiler ID: 0).
```

From `crates/rspack_plugin_rsc/src/server_plugin.rs` in `@rspack/binding`.
Fires during the server plugin's `complete_client_entries_compilation`
transition: the worker entry name is in the RSC plugin's state map but no
chunk exists for it (tree-shaking dropped the worker chunk after parse).

### Minimal trigger (now fixed)

1. **`rsc.enabled: true` in `rsbuild.config.ts`.**
2. **A route spawns a worker with a `webpackChunkName` magic comment** in
   [`src/routes/worker-bug.tsx`](./src/routes/worker-bug.tsx):

   ```tsx
   new Worker(
     /* webpackChunkName: "my-worker" */ new URL(
       './-worker/spawn.js',
       import.meta.url,
     ),
     { type: 'module' },
   )
   ```

3. **The worker source imports an external npm package** in
   [`src/routes/-worker/spawn.js`](./src/routes/-worker/spawn.js):

   ```js
   import * as clsx from 'clsx'

   self.onmessage = (event) => {
     const tag = (clsx.default ?? clsx)('echo')
     self.postMessage(`${tag}: ${event.data}`)
   }
   ```

| Variation                                                  | Build (rspack 2.0.3)             | Build (canary 2.0.4)        |
| ---------------------------------------------------------- | -------------------------------- | --------------------------- |
| Baseline (all three above)                                 | ❌ FAILS with entry-state error  | ✅ passes                   |
| Remove `webpackChunkName` magic comment                    | ✅ passes                        | ✅ passes                   |
| Remove the `import * as clsx from 'clsx'` line             | ✅ passes                        | ✅ passes                   |
| `tanstackStart({ rsc: { enabled: false } })`               | ✅ passes                        | ✅ passes                   |

### Root cause (pre-fix)

When rspack parsed `new Worker(new URL(...))` with a `webpackChunkName`,
`WorkerPlugin` registered a named worker child entry. The RSC `ServerPlugin`
recorded a per-entry state slot keyed by that name. The worker's npm import
pulled vendor code into the worker chunk — enough for rspack's chunk
splitter / tree-shaker to drop the worker chunk from the final client chunk
graph while leaving the entry-state slot intact. The server plugin's
iteration of client entries then found an orphan name and threw.

The pinned `@rspack/core` canary `2.0.4-canary-32cafdc6-20260518042857`
(applied via the workspace-root `package.json` overrides) treats this case
non-fatally.
