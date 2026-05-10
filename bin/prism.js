#!/usr/bin/env node
/**
 * PRISM — AI Coding Agent CLI
 * Multi-provider, MCP-enabled, cross-platform terminal & web interface.
 *
 * Combines the best of OpenCode, Pi, and OpenClaude into one powerful tool.
 */

import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Dynamic import for ESM compatibility
async function main() {
  const { runCLI } = await import('../dist/cli/index.js');
  await runCLI();
}

main().catch((error) => {
  console.error('PRISM failed to start:', error.message);
  process.exit(1);
});
