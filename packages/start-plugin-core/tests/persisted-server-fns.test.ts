import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import {
  loadPersistedServerFns,
  resolveServerFnCachePath,
  savePersistedServerFns,
} from '../src/rsbuild/persisted-server-fns'
import type { ServerFn } from '../src/start-compiler/types'

function makeServerFn(id: string): ServerFn {
  return {
    functionId: id,
    functionName: `fn_${id}`,
    extractedFilename: `/src/${id}.ts?tss-serverfn-split`,
    filename: `/src/${id}.ts`,
    isClientReferenced: true,
  }
}

describe('persisted server-fn registry', () => {
  let root: string

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'tss-persist-'))
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  test('cache path lives under node_modules/.cache/tanstack-start/', () => {
    expect(resolveServerFnCachePath(root)).toBe(
      join(root, 'node_modules', '.cache', 'tanstack-start', 'server-fns.json'),
    )
  })

  test('load returns {} when no cache file exists', () => {
    expect(loadPersistedServerFns(root)).toEqual({})
  })

  test('save + load round-trips the registry verbatim', () => {
    const registry = { a: makeServerFn('a'), b: makeServerFn('b') }
    savePersistedServerFns(root, registry)
    expect(loadPersistedServerFns(root)).toEqual(registry)
  })

  test('load returns {} for malformed JSON', () => {
    const cachePath = resolveServerFnCachePath(root)
    mkdirSync(dirname(cachePath), { recursive: true })
    writeFileSync(cachePath, 'not-json')
    expect(loadPersistedServerFns(root)).toEqual({})
  })

  test('load returns {} when the file is a non-object JSON value', () => {
    const cachePath = resolveServerFnCachePath(root)
    mkdirSync(dirname(cachePath), { recursive: true })
    writeFileSync(cachePath, '[]')
    expect(loadPersistedServerFns(root)).toEqual({})
  })

  test('save overwrites prior contents', () => {
    savePersistedServerFns(root, { a: makeServerFn('a') })
    savePersistedServerFns(root, { b: makeServerFn('b') })
    expect(loadPersistedServerFns(root)).toEqual({ b: makeServerFn('b') })
  })
})
