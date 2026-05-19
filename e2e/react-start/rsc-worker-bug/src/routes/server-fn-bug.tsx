import { createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'

// New repro: a `createServerFn(...).handler(...)` whose body imports anything
// from `@tanstack/react-start/server` triggers an SWC reactServerComponents
// transform error in `src/router.tsx`:
//
//   × You're importing a component that needs `useEffect`. This React Hook
//     only works in a Client Component. To fix, mark the file (or its
//     parent) with the `"use client"` directive.
//
// Inside the `?tss-serverfn-split` body (RSC layer),
// `@tanstack/react-start/server` resolves via the `react-server` package
// export condition to `server.rsc.js`. That pulls `createStartHandler.js`
// (and thus the user's `router.tsx`) into the RSC layer transitively.
// SWC then sees `import { useEffect } from 'react'` in router.tsx and
// refuses it.
const ping = createServerFn({ method: 'GET' }).handler(async () => {
  return getRequest().url
})

export const Route = createFileRoute('/server-fn-bug')({
  loader: async () => ({ url: await ping() }),
  component: () => {
    const { url } = Route.useLoaderData()
    return <p>server url: <code>{url}</code></p>
  },
})
