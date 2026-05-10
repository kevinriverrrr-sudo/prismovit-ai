#!/bin/bash
# PRISM AI — Quick Install Script
# Supports: macOS, Linux, Windows (Git Bash), Android (Termux)

set -e

echo ""
echo "  ◆ PRISM AI — Multi-Provider AI Coding Agent CLI"
echo "  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Check Node.js version
if ! command -v node &> /dev/null; then
    echo "  ❌ Node.js is not installed."
    echo ""
    echo "  Install Node.js:"
    echo "    macOS:  brew install node"
    echo "    Linux:  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo bash - && sudo apt install -y nodejs"
    echo "    Windows: https://nodejs.org"
    echo "    Termux: pkg install nodejs"
    echo ""
    exit 1
fi

NODE_VERSION=$(node -v | sed 's/v//' | cut -d. -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo "  ❌ Node.js v18+ required (found v$NODE_VERSION)"
    exit 1
fi

echo "  ✅ Node.js v$(node -v) detected"

# Detect platform
PLATFORM="unknown"
IS_TERMUX=false

if [ -n "$TERMUX_VERSION" ] || [ -n "$TERMUX_APP__PACKAGE_NAME" ]; then
    PLATFORM="termux"
    IS_TERMUX=true
elif [ "$(uname)" = "Darwin" ]; then
    PLATFORM="macos"
elif [ "$(uname)" = "Linux" ]; then
    PLATFORM="linux"
elif echo "$(uname)" | grep -qi "MINGW\|MSYS\|CYGWIN"; then
    PLATFORM="windows"
fi

echo "  🖥️  Platform: $PLATFORM"

# Install Termux-specific dependencies if needed
if [ "$IS_TERMUX" = true ]; then
    echo "  📦 Installing Termux dependencies..."
    pkg install -y nodejs-lts 2>/dev/null || true
fi

# Install PRISM globally
echo ""
echo "  📦 Installing PRISM AI globally via npm..."
echo ""

npm install -g prism-ai 2>&1 || {
    echo ""
    echo "  ⚠️  npm global install failed."
    echo "  Install manually: npx prism-ai or clone this repo and run: npm install && npm run build && npm link"
}

echo ""
echo "  ✅ PRISM AI ready!"
echo ""
echo "  Quick Start:"
echo "    prism              → Interactive TUI chat"
echo "    prism 'hello'      → Quick prompt"
echo "    prism --web        → Web interface (localhost:3141)"
echo "    prism --help       → All options"
echo ""
