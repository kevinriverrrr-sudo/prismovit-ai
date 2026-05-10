#!/usr/bin/env node
/**
 * PRISM — AI Coding Agent CLI
 * Multi-provider, MCP-enabled, cross-platform terminal & web interface.
 *
 * Combines the best of OpenCode, Pi, and OpenClaude into one powerful tool.
 */

import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const pkgRoot = resolve(__dirname, '..');

async function main() {
  const { runCLI } = await import(resolve(pkgRoot, 'dist', 'cli', 'index.js'));
  await runCLI();
}

main().catch((error) => {
  console.error('PRISM failed to start:', error.message);
  process.exit(1);
});
