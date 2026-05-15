// @ts-check

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const rootDir = path.resolve(__dirname, '..')
const packagesDir = path.join(rootDir, 'packages')

/**
 * Get all workspace packages
 * @returns {Map<string, object>} Map of package name to package.json
 */
function getAllPackages() {
  const packages = new Map()
  const entries = fs.readdirSync(packagesDir, { withFileTypes: true })

  for (const entry of entries) {
    if (!entry.isDirectory()) continue

    const packageJsonPath = path.join(packagesDir, entry.name, 'package.json')
    if (!fs.existsSync(packageJsonPath)) continue

    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'))
    if (packageJson.name) {
      packages.set(packageJson.name, { ...packageJson, dirName: entry.name })
    }
  }

  return packages
}

/**
 * Find all dependencies recursively
 * @param {string} packageName - The package name to start from
 * @param {Map<string, object>} allPackages - Map of all workspace packages
 * @param {Set<string>} visited - Set of already visited packages
 */
function findDependencies(packageName, allPackages, visited = new Set()) {
  if (visited.has(packageName)) return
  if (!allPackages.has(packageName)) return

  visited.add(packageName)
  const pkg = allPackages.get(packageName)

  const depTypes = ['dependencies', 'devDependencies', 'peerDependencies']
  for (const depType of depTypes) {
    if (!pkg[depType]) continue

    for (const [depName, depVersion] of Object.entries(pkg[depType])) {
      if (typeof depVersion === 'string' && depVersion.startsWith('workspace:')) {
        findDependencies(depName, allPackages, visited)
      }
    }
  }

  return visited
}

/**
 * Main function
 */
function main() {
  const args = process.argv.slice(2)

  if (args.length === 0) {
    console.error('Usage: node find-dependencies.js <package-name> [<package-name> ...]')
    process.exit(1)
  }

  const allPackages = getAllPackages()
  const allDeps = new Set()

  // Find dependencies for each specified package
  for (const pkgName of args) {
    const fullName = pkgName.startsWith('@tanstack/') ? pkgName : `@tanstack/${pkgName}`

    if (!allPackages.has(fullName)) {
      console.error(`❌ Package not found: ${fullName}`)
      continue
    }

    const deps = findDependencies(fullName, allPackages)
    deps.forEach(dep => allDeps.add(dep))
  }

  // Sort and output
  const sorted = Array.from(allDeps).sort()
  console.log('\n📦 Packages to pack:\n')
  sorted.forEach((pkg, index) => {
    const pkgData = allPackages.get(pkg)
    const dirName = pkgData?.dirName || pkg.replace('@tanstack/', '')
    console.log(`${index + 1}. ${pkg} (${dirName})`)
  })

  console.log(`\n✅ Total: ${sorted.length} packages`)

  // Output filter pattern for pack script
  console.log('\n📝 To pack all these packages, run:')
  console.log(`pnpm run pack:packages`)
  console.log('\nOr to pack individually:')
  sorted.forEach(pkg => {
    const pkgData = allPackages.get(pkg)
    const dirName = pkgData?.dirName || pkg.replace('@tanstack/', '')
    console.log(`node scripts/pack-packages.js --filter "${dirName}"`)
  })
}

main()
