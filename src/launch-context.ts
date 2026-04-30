// Launch-context detection for MemForge clients.
//
// Why this module exists.
//   The multi-device contract asks every client launch to declare a project
//   namespace and a per-device session_id. Forcing users to remember to
//   `export MEMFORGE_NAMESPACE=...` before launching Claude Code in every
//   project would defeat the point — they'd forget, fall back to
//   namespace='default', and lose project compartmentalization. So the
//   MCP server (and any other client that wants to opt in) auto-derives a
//   project namespace from cheap launch signals: git repo root or cwd
//   basename. Either auto-value is overridden the moment the user sets
//   the corresponding env var.
//
// Why a separate module: the MCP entrypoint (src/mcp.ts) starts running
// `main()` at module load, so it can't be imported in a test. The slug
// and detection logic live here so they're unit-testable in isolation.

import { execFileSync } from 'child_process';
import { basename } from 'path';

/**
 * Slugify a project name into a valid namespace token. Returns null if
 * no clean slug can be produced (e.g. all non-alphanumeric input). The
 * output matches the server's NamespaceSchema regex
 * `^[a-z0-9][a-z0-9_-]*$`, max 64 chars.
 */
export function toNamespaceSlug(raw: string): string | null {
  const slug = raw
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
  if (!slug || !/^[a-z0-9]/.test(slug)) return null;
  return slug;
}

/**
 * Best-effort detection of the project the client is launched within.
 * Tries the git repo root first (most reliable), falls back to the cwd
 * basename. Returns a `project-<slug>` namespace, or null if nothing
 * usable can be derived.
 */
export function deriveLaunchNamespace(cwd: string = process.cwd()): string | null {
  let projectName: string | null = null;
  try {
    const root = execFileSync('git', ['rev-parse', '--show-toplevel'], {
      cwd,
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 1000,
    }).toString().trim();
    if (root) projectName = basename(root);
  } catch {
    // not a git repo, or git not on PATH — fall through
  }
  if (!projectName) {
    const cwdName = basename(cwd);
    if (cwdName && cwdName !== '/' && cwdName !== '.') projectName = cwdName;
  }
  if (!projectName) return null;
  return toNamespaceSlug(`project-${projectName}`);
}
