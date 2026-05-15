#!/bin/bash

# Pack all TanStack packages with file: references for workspace dependencies
# Usage: bash scripts/pack-all-absolute-paths.sh [target-path] [version]
# Default target: "tarballs" (relative path from project root)
# Default version: 0.0.0-rsc-tarball
# Examples:
#   bash scripts/pack-all-absolute-paths.sh "tarballs" "0.0.0-rsc-tarball"
#   bash scripts/pack-all-absolute-paths.sh "tarballs"

TARGET_PATH="${1:-tarballs}"
VERSION="${2:-0.0.0-rsc-tarball}"

echo "🚀 Packing all packages with file: path references..."
echo "🎯 Target path: $TARGET_PATH"
echo "📌 Version: $VERSION"
echo ""

# All 20 packages in dependency order
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
  node scripts/pack-packages.js --filter "$pkg" --target-path "$TARGET_PATH" --set-version "$VERSION"

  if [ $? -ne 0 ]; then
    echo "❌ Failed to pack $pkg"
    exit 1
  fi
done

echo ""
echo "✅ All packages packed successfully with file: path references!"
echo "📂 Tarballs location: dist-tarballs/"
echo "🎯 Configured for target: $TARGET_PATH"
echo "📌 All packages versioned as: $VERSION"
