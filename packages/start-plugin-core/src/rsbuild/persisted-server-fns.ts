import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { ServerFn } from '../start-compiler/types'

// Rspack's persistent cache restores transformed modules without re-running
// their loaders, so the StartCompiler transform's `onServerFnsById` side effect
// is skipped on cache-hit files. That leaves the in-memory registry empty on
// warm dev starts and produces "Server function info not found" at runtime.
//
// Persisting the registry next to rspack's own cache keeps both in lockstep:
// when a user wipes `node_modules/.cache/` they get a clean slate for both.
// If a source file changes while dev is off, rspack invalidates that file's
// cache entry on the next start and the transform re-runs, overwriting any
// stale entry — so we don't need fingerprints or version markers here.

const CACHE_RELATIVE_PATH = join(
  'node_modules',
  '.cache',
  'tanstack-start',
  'server-fns.json',
)

export function resolveServerFnCachePath(root: string): string {
  return join(root, CACHE_RELATIVE_PATH)
}

export function loadPersistedServerFns(
  root: string,
): Record<string, ServerFn> {
  try {
    const raw = readFileSync(resolveServerFnCachePath(root), 'utf8')
    const parsed: unknown = JSON.parse(raw)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, ServerFn>
    }
  } catch {
    // Missing/malformed cache → start fresh; transforms will repopulate.
  }
  return {}
}

export function savePersistedServerFns(
  root: string,
  serverFnsById: Record<string, ServerFn>,
): void {
  const cachePath = resolveServerFnCachePath(root)
  try {
    mkdirSync(dirname(cachePath), { recursive: true })
    writeFileSync(cachePath, JSON.stringify(serverFnsById), 'utf8')
  } catch {
    // Persistence is an optimization, not a correctness requirement.
  }
}
