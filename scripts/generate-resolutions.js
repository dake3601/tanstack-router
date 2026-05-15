// @ts-check

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const rootDir = path.resolve(__dirname, '..')

// Parse command-line arguments
const args = process.argv.slice(2)
const dirArg = args.indexOf('--dir')
const targetPathArg = args.indexOf('--target-path')
const exactVersion = args.includes('--exact-version')

const tarballsDir = (dirArg !== -1 && dirArg + 1 < args.length ? args[dirArg + 1] : null) || 'dist-tarballs'
const targetPath = targetPathArg !== -1 && targetPathArg + 1 < args.length ? args[targetPathArg + 1] : 'tarballs'

const absoluteTarballsDir = path.resolve(rootDir, tarballsDir)

/**
 * Extract package name and version from tarball filename
 * @param {string} filename - Tarball filename (e.g., "tanstack-react-router-1.147.3.tgz")
 * @returns {{name: string, version: string} | null}
 */
function parseTarballFilename(filename) {
  if (!filename.endsWith('.tgz')) return null

  // Remove .tgz extension
  const nameWithVersion = filename.slice(0, -4)

  // Pattern: tanstack-{package-name}-{version}
  // Version typically starts with a digit after tanstack-{package-name}-
  // Find the first dash followed by a digit (start of version)
  const match = nameWithVersion.match(/^(tanstack-.+?)-(\d.*)$/)
  if (!match) return null

  const name = match[1]
  const version = match[2]

  // Convert tanstack-react-router to @tanstack/react-router
  const packageName = name.replace('tanstack-', '@tanstack/')

  return { name: packageName, version }
}

/**
 * Generate resolutions object from tarballs directory
 */
function generateResolutions() {
  console.log('🔍 Scanning tarballs directory...')
  console.log(`📂 Directory: ${absoluteTarballsDir}`)
  console.log(`🎯 Target path: ${targetPath}`)
  console.log(`📌 Exact version: ${exactVersion}`)
  console.log('')

  if (!fs.existsSync(absoluteTarballsDir)) {
    console.error(`❌ Directory not found: ${absoluteTarballsDir}`)
    process.exit(1)
  }

  const files = fs.readdirSync(absoluteTarballsDir)
  const tarballs = files.filter(f => f.endsWith('.tgz'))

  if (tarballs.length === 0) {
    console.error(`❌ No .tgz files found in ${absoluteTarballsDir}`)
    process.exit(1)
  }

  console.log(`Found ${tarballs.length} tarballs:\n`)

  const resolutions = {}

  for (const tarball of tarballs) {
    const parsed = parseTarballFilename(tarball)
    if (!parsed) {
      console.warn(`⚠️  Could not parse: ${tarball}`)
      continue
    }

    const { name, version } = parsed

    // Create resolution key with or without version specifier
    const resolutionKey = exactVersion ? `${name}@${version}` : name

    // Create file path
    const filePath = `file:./${targetPath}/${tarball}`

    resolutions[resolutionKey] = filePath
    console.log(`✅ ${resolutionKey} → ${filePath}`)
  }

  console.log('\n' + '='.repeat(60))
  console.log('📋 Generated Resolutions (copy this to your package.json):')
  console.log('='.repeat(60))
  console.log('')
  console.log(JSON.stringify({ resolutions }, null, 2))
  console.log('')
  console.log('='.repeat(60))

  // Also output just the resolutions object without the wrapper
  console.log('\n📋 Or just the resolutions field:')
  console.log('='.repeat(60))
  console.log('')
  console.log('"resolutions": ' + JSON.stringify(resolutions, null, 2))
  console.log('')
}

generateResolutions()
