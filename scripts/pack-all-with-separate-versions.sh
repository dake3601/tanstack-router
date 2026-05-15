#!/bin/bash

# Pack all TanStack packages with separate versions for packages and dependencies
# Usage: bash scripts/pack-all-with-separate-versions.sh [package-version] [deps-version]
# Default package version: 0.0.2-rsc-tarball
# Default deps version: 0.0.1-rsc-tarball
# Examples:
#   bash scripts/pack-all-with-separate-versions.sh "0.0.2-rsc-tarball" "0.0.1-rsc-tarball"
#   bash scripts/pack-all-with-separate-versions.sh "0.0.3-rsc-tarball"

PACKAGE_VERSION="${1:-0.0.2-rsc-tarball}"
DEPS_VERSION="${2:-0.0.1-rsc-tarball}"

echo "🚀 Packing all packages with separate versions..."
echo "📦 Package version: $PACKAGE_VERSION"
echo "🔗 Dependencies version: $DEPS_VERSION"
echo ""

# All packages in dependency order
packages=(
  "history"
  "router-core"
  "router-devtools-core"
  "router-ssr-query-core"
  "react-router"
  "start-fn-stubs"
  "start-storage-context"
  "start-client-core"
  "react-start-client"
  "start-server-core"
  "react-start-server"
  "react-start-rsc"
  "router-utils"
  "virtual-file-routes"
  "router-generator"
  "router-plugin"
  "start-plugin-core"
  "react-start"
  "react-router-devtools"
  "react-router-ssr-query"
)

for pkg in "${packages[@]}"; do
  echo "📦 Packing $pkg..."
  node scripts/pack-packages.js --filter "$pkg" --set-version "$PACKAGE_VERSION" --deps-version "$DEPS_VERSION"

  if [ $? -ne 0 ]; then
    echo "❌ Failed to pack $pkg"
    exit 1
  fi
done

echo ""
echo "✅ All packages packed successfully!"
echo "📂 Tarballs location: dist-tarballs/"
echo "📦 Package version: $PACKAGE_VERSION"
echo "🔗 Dependencies version: $DEPS_VERSION"
