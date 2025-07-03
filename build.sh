#!/bin/bash

# Build script for Archion Settings
# This script helps with local testing of the PKGBUILD

set -e

echo "Building Archion Settings..."

# Build the package
makepkg -si

echo "Build complete!"
