// @ts-check

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const rootDir = path.resolve(__dirname, '..')
const packagesDir = path.join(rootDir, 'packages')

// Parse command-line arguments
const args = process.argv.slice(2)
const filterArg = args.indexOf('--filter')
const outArg = args.indexOf('--out')
const targetPathArg = args.indexOf('--target-path')
const setVersionArg = args.indexOf('--set-version')
const depsVersionArg = args.indexOf('--deps-version')
const exactVersions = args.includes('--exact')
const useTarballRefs = args.includes('--tarball-refs')
const useAbsolutePaths = args.includes('--absolute-paths')

const filterPattern = filterArg !== -1 && filterArg + 1 < args.length ? args[filterArg + 1] : null
const outputDir = (outArg !== -1 && outArg + 1 < args.length ? args[outArg + 1] : null) || 'dist-tarballs'
const targetPath = targetPathArg !== -1 && targetPathArg + 1 < args.length ? args[targetPathArg + 1] : null
const setVersion = setVersionArg !== -1 && setVersionArg + 1 < args.length ? args[setVersionArg + 1] : null
const depsVersion = depsVersionArg !== -1 && depsVersionArg + 1 < args.length ? args[depsVersionArg + 1] : null

const absoluteOutputDir = path.resolve(rootDir, outputDir)
// Use targetPath as-is if provided (can be relative like "tarballs" or absolute like "C:/path/to/tarballs")
const targetTarballDir = targetPath || absoluteOutputDir

// Create output directory if it doesn't exist
if (!fs.existsSync(absoluteOutputDir)) {
  fs.mkdirSync(absoluteOutputDir, { recursive: true })
  console.log(`✅ Created output directory: ${absoluteOutputDir}`)
}

/**
 * Build a map of all workspace package versions
 * @returns {Map<string, string>} Map of package name to version
 */
function getWorkspaceVersions() {
  const versions = new Map()
  const entries = fs.readdirSync(packagesDir, { withFileTypes: true })

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue
    }

    const packageJsonPath = path.join(packagesDir, entry.name, 'package.json')
    if (!fs.existsSync(packageJsonPath)) {
      continue
    }

    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'))
    if (packageJson.name && packageJson.version) {
      versions.set(packageJson.name, packageJson.version)
    }
  }

  return versions
}

/**
 * Replace workspace:* dependencies with actual version ranges or tarball references
 * @param {object} packageJson - The package.json object
 * @param {Map<string, string>} workspaceVersions - Map of workspace package versions
 * @param {boolean} useExactVersions - If true, use exact versions instead of ^
 * @param {boolean} useTarballRefs - If true, use file: references to tarballs
 * @param {boolean} useAbsolutePaths - If true, use absolute paths for file: references
 * @param {string} tarballDir - Directory where tarballs will be located
 * @param {string|null|undefined} overrideVersion - If provided, use this version for the package itself
 * @param {string|null|undefined} overrideDepsVersion - If provided, use this version for workspace dependencies
 * @returns {object} Modified package.json
 */
function resolveWorkspaceDependencies(packageJson, workspaceVersions, useExactVersions = false, useTarballRefs = false, useAbsolutePaths = false, tarballDir = absoluteOutputDir, overrideVersion = undefined, overrideDepsVersion = undefined) {
  const resolved = JSON.parse(JSON.stringify(packageJson)) // Deep clone

  // Override package version if specified
  if (overrideVersion) {
    resolved.version = overrideVersion
    console.log(`   📝 Package version: ${packageJson.version} → ${overrideVersion}`)
  }

  const depTypes = ['dependencies', 'devDependencies', 'peerDependencies']

  for (const depType of depTypes) {
    if (!resolved[depType]) continue

    for (const [depName, depVersion] of Object.entries(resolved[depType])) {
      if (typeof depVersion === 'string' && depVersion.startsWith('workspace:')) {
        // Use override deps version if provided, otherwise use override version, otherwise use the actual version
        const actualVersion = overrideDepsVersion || overrideVersion || workspaceVersions.get(depName)
        if (actualVersion) {
          let resolvedValue

          // When override deps version or override version is set, always use version string (not file: refs)
          if (overrideDepsVersion || overrideVersion) {
            resolvedValue = useExactVersions ? actualVersion : actualVersion
            console.log(`   📝 ${depName}: ${depVersion} → ${resolvedValue}`)
          } else if (useTarballRefs || useAbsolutePaths) {
            const tarballName = `${depName.replace('@tanstack/', 'tanstack-')}-${actualVersion}.tgz`

            if (useAbsolutePaths) {
              // Use file: path to target location
              // If it looks like an absolute path (C:/ or /), use it directly
              // Otherwise treat it as a relative path from project root
              const isAbsolutePath = path.isAbsolute(tarballDir)
              if (isAbsolutePath) {
                const absoluteTarballPath = path.join(tarballDir, tarballName)
                resolvedValue = `file:${absoluteTarballPath}`
              } else {
                // Use the relative path as-is with forward slashes
                resolvedValue = `file:${tarballDir}/${tarballName}`
              }
              console.log(`   📝 ${depName}: ${depVersion} → ${resolvedValue}`)
            } else {
              // Use relative file: reference from node_modules
              // From node_modules/@tanstack/package-name/ to project root is ../../../
              resolvedValue = `file:../../../tarballs/${tarballName}`
              console.log(`   📝 ${depName}: ${depVersion} → ${resolvedValue}`)
            }
          } else {
            // Replace workspace:* or workspace:^ with exact or ^version
            resolvedValue = useExactVersions ? actualVersion : `^${actualVersion}`
            console.log(`   📝 ${depName}: ${depVersion} → ${resolvedValue}`)
          }

          resolved[depType][depName] = resolvedValue
        }
      }
    }
  }

  return resolved
}

/**
 * Pack a single package using npm pack
 * @param {string} packagePath - Absolute path to the package directory
 * @param {string} packageName - Name of the package
 * @param {Map<string, string>} workspaceVersions - Map of workspace package versions
 * @param {boolean} useExactVersions - If true, use exact versions instead of ^
 * @param {boolean} useTarballRefs - If true, use file: references to tarballs
 * @param {boolean} useAbsolutePaths - If true, use absolute paths for file: references
 * @param {string} tarballDir - Directory where tarballs will be located
 * @param {string|undefined} overrideVersion - If provided, override version for package
 * @param {string|undefined} overrideDepsVersion - If provided, override version for deps
 */
function packPackage(packagePath, packageName, workspaceVersions, useExactVersions = false, useTarballRefs = false, useAbsolutePaths = false, tarballDir = absoluteOutputDir, overrideVersion = undefined, overrideDepsVersion = undefined) {
  const packageJsonPath = path.join(packagePath, 'package.json')
  const packageJsonBackupPath = path.join(packagePath, 'package.json.backup')

  try {
    console.log(`\n📦 Packing ${packageName}...`)

    // Read and backup original package.json
    const originalPackageJson = fs.readFileSync(packageJsonPath, 'utf-8')
    const packageJson = JSON.parse(originalPackageJson)

    // Resolve workspace dependencies
    const resolvedPackageJson = resolveWorkspaceDependencies(packageJson, workspaceVersions, useExactVersions, useTarballRefs, useAbsolutePaths, tarballDir, overrideVersion, overrideDepsVersion)

    // Write the resolved package.json temporarily
    fs.writeFileSync(packageJsonBackupPath, originalPackageJson)
    fs.writeFileSync(packageJsonPath, JSON.stringify(resolvedPackageJson, null, 2))

    // Run npm pack with --pack-destination
    const command = `npm pack --pack-destination "${absoluteOutputDir}"`
    execSync(command, {
      cwd: packagePath,
      stdio: 'inherit'
    })

    console.log(`✅ Packed ${packageName}`)
    return true
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    console.error(`❌ Failed to pack ${packageName}:`, errorMessage)
    return false
  } finally {
    // Restore original package.json
    if (fs.existsSync(packageJsonBackupPath)) {
      fs.renameSync(packageJsonBackupPath, packageJsonPath)
    }
  }
}

/**
 * Main function to pack packages
 */
function main() {
  console.log('🚀 Starting package packing...')
  console.log(`📂 Packages directory: ${packagesDir}`)
  console.log(`📂 Output directory: ${absoluteOutputDir}`)

  if (filterPattern) {
    console.log(`🔍 Filter pattern: ${filterPattern}`)
  }

  if (exactVersions) {
    console.log('📌 Using exact versions (no ^ prefix)')
  }

  if (useTarballRefs) {
    console.log('📦 Using tarball file: references for workspace dependencies')
  }

  if (useAbsolutePaths) {
    console.log('🗺️  Using absolute paths for file: references')
    if (targetPath) {
      console.log(`🎯 Target path for absolute references: ${targetTarballDir}`)
    }
  }

  // Build workspace versions map
  console.log('\n🔍 Scanning workspace for package versions...')
  const workspaceVersions = getWorkspaceVersions()
  console.log(`   Found ${workspaceVersions.size} workspace packages`)

  // Read packages directory
  const entries = fs.readdirSync(packagesDir, { withFileTypes: true })

  let packedCount = 0
  let failedCount = 0

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue
    }

    const packagePath = path.join(packagesDir, entry.name)
    const packageJsonPath = path.join(packagePath, 'package.json')

    // Check if package.json exists
    if (!fs.existsSync(packageJsonPath)) {
      console.log(`⚠️  Skipping ${entry.name} (no package.json found)`)
      continue
    }

    // Read package.json to get package name
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'))
    const packageName = packageJson.name || entry.name

    // Apply filter if specified
    if (filterPattern) {
      let matchesFilter = false

      // Support exact match with $ suffix (e.g., "react-start$")
      if (filterPattern.endsWith('$')) {
        const exactPattern = filterPattern.slice(0, -1)
        matchesFilter = packageName === `@tanstack/${exactPattern}` || entry.name === exactPattern
      } else {
        matchesFilter = packageName.includes(filterPattern) || entry.name.includes(filterPattern)
      }

      if (!matchesFilter) {
        continue
      }
    }

    // Pack the package
    const success = packPackage(packagePath, packageName, workspaceVersions, exactVersions, useTarballRefs, useAbsolutePaths, targetTarballDir, setVersion || undefined, depsVersion || undefined)
    if (success) {
      packedCount++
    } else {
      failedCount++
    }
  }

  // Print summary
  console.log('\n' + '='.repeat(50))
  console.log('📊 Packing Summary:')
  console.log(`   ✅ Successfully packed: ${packedCount}`)
  if (failedCount > 0) {
    console.log(`   ❌ Failed: ${failedCount}`)
  }
  console.log(`   📂 Output: ${absoluteOutputDir}`)
  console.log('='.repeat(50))

  // Exit with error code if any failures
  process.exit(failedCount > 0 ? 1 : 0)
}

main()
