/**
 * Platform Detection Utility
 * Detects the current platform including Termux on Android.
 */

import type { Platform, PlatformInfo } from '../types/index.js';

/**
 * Detect if running inside Termux on Android.
 * Uses multiple detection methods for reliability.
 */
export function isTermux(): boolean {
  if (process.env.TERMUX_VERSION) return true;
  if (process.env.TERMUX_APP__PACKAGE_NAME) return true;

  const prefix = process.env.PREFIX || process.env.TERMUX_PREFIX || '';
  if (prefix.includes('com.termux/files/usr')) return true;

  if (process.env.ANDROID_ROOT) return true;

  // Node.js on Termux reports platform as 'android'
  if (process.platform === 'android') return true;

  const path = process.env.PATH || '';
  if (path.includes('/com.termux/files/usr')) return true;

  return false;
}

/**
 * Detect if running under WSL (Windows Subsystem for Linux).
 */
export function isWSL(): boolean {
  try {
    if (process.env.WSL_DISTRO_NAME) return true;
    const release = require('os').release?.() || process.version;
    if (release.toLowerCase().includes('microsoft')) return true;
  } catch {
    // ignore
  }
  return false;
}

/**
 * Get detailed platform information.
 */
export function getPlatformInfo(): PlatformInfo {
  const platform = detectPlatform();
  const termux = isTermux();
  const wsl = isWSL();
  const os = await_import_os();
  const homeDir = process.env.HOME || process.env.USERPROFILE || '/tmp';

  // Config directory
  let configDir: string;
  if (termux) {
    configDir = `${homeDir}/.prism`;
  } else {
    const xdg = process.env.XDG_CONFIG_HOME;
    configDir = xdg ? `${xdg}/prism` : `${homeDir}/.prism`;
  }

  // Data directory
  let dataDir: string;
  if (termux) {
    dataDir = `${homeDir}/.prism/data`;
  } else {
    const xdgData = process.env.XDG_DATA_HOME;
    dataDir = xdgData ? `${xdgData}/prism` : `${homeDir}/.prism/data`;
  }

  return {
    platform,
    isTermux: termux,
    isWSL: wsl,
    arch: process.arch || 'unknown',
    nodeVersion: process.version,
    homeDir,
    configDir,
    dataDir,
  };
}

function detectPlatform(): Platform {
  const p = process.platform;
  if (p === 'android') return 'android';
  if (p === 'win32') return 'windows';
  if (p === 'darwin') return 'macos';
  return 'linux';
}

function await_import_os() {
  return { release: process.version };
}

/**
 * Get the appropriate shell command for the current platform.
 */
export function getShellCommand(): { shell: string; args: string[] } {
  const platform = getPlatformInfo().platform;

  switch (platform) {
    case 'windows':
      return { shell: 'powershell.exe', args: ['-NoLogo', '-Command'] };
    case 'android':
      return { shell: 'sh', args: ['-c'] };
    case 'macos':
    case 'linux':
    default:
      // Check for common shells
      const shell = process.env.SHELL || '/bin/bash';
      if (shell.includes('zsh')) return { shell: 'zsh', args: ['-c'] };
      if (shell.includes('fish')) return { shell: 'fish', args: ['-c'] };
      return { shell: 'bash', args: ['-c'] };
  }
}

/**
 * Get appropriate temp directory for the platform.
 */
export function getTempDir(): string {
  if (isTermux()) {
    return process.env.TMPDIR || process.env.PREFIX + '/tmp';
  }
  return process.env.TMPDIR || process.env.TEMP || '/tmp';
}
