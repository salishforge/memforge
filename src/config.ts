// MemForge — Reloadable runtime configuration store.
//
// Why this module exists.
//   MemForge has historically loaded config from process.env at module load
//   time and cached the values as `const` in the closures that use them.
//   That works for static infrastructure (DATABASE_URL, ADMIN_TOKEN, port)
//   but blocks the multi-device feature's "hot reconfiguration" goal: a
//   long-running session must be able to flip operational knobs (warm-tier
//   consolidation target, consolidation mode, LLM rerank toggles) without
//   restarting and losing in-flight session state.
//
// What this module does.
//   Wraps an allowlisted set of keys (RELOADABLE_CONFIG_KEYS in schemas.ts)
//   in a small singleton that the rest of the app reads through `getConfig()`
//   instead of process.env directly. The admin route /admin/config/reload
//   re-reads process.env (or applies explicit overrides) and updates the
//   in-memory snapshot — subsequent reads see the new value, no restart.
//
// What this module does NOT do.
//   Static infrastructure (DATABASE_URL, port, ADMIN_TOKEN, OAuth2 settings,
//   audit HMAC key, RLS policies) stays restart-only — these have blast
//   radius beyond a single config flag and should not be hot-swapped at
//   runtime. They keep their existing direct process.env reads.

import { RELOADABLE_CONFIG_KEYS } from './schemas.js';
import { getLogger } from './logger.js';

const log = getLogger('config');

type ReloadableKey = (typeof RELOADABLE_CONFIG_KEYS)[number];

type ConfigSnapshot = Partial<Record<ReloadableKey, string>>;

function snapshotFromEnv(): ConfigSnapshot {
  const snap: ConfigSnapshot = {};
  for (const key of RELOADABLE_CONFIG_KEYS) {
    const value = process.env[key];
    if (value !== undefined) snap[key] = value;
  }
  return snap;
}

let current: ConfigSnapshot = snapshotFromEnv();

export function getConfig(key: ReloadableKey): string | undefined {
  return current[key];
}

export interface ReloadResult {
  reloaded_at: string;
  /** Keys whose value changed (added, removed, or modified). */
  changed: ReloadableKey[];
  /** Keys present in the current snapshot. */
  active: ReloadableKey[];
}

/**
 * Re-read all allowlisted keys. When `overrides` is provided, only those
 * keys are updated — the rest are left at their current value (i.e.,
 * targeted update, not a full env re-read).
 */
export function reloadConfig(overrides?: Partial<Record<ReloadableKey, string>>): ReloadResult {
  const previous = current;
  let next: ConfigSnapshot;

  if (overrides) {
    next = { ...previous, ...overrides };
  } else {
    next = snapshotFromEnv();
  }

  const changed: ReloadableKey[] = [];
  for (const key of RELOADABLE_CONFIG_KEYS) {
    if (previous[key] !== next[key]) changed.push(key);
  }

  current = next;
  log.info({ changed, source: overrides ? 'overrides' : 'process.env' }, 'config reloaded');

  return {
    reloaded_at: new Date().toISOString(),
    changed,
    active: RELOADABLE_CONFIG_KEYS.filter((k) => current[k] !== undefined),
  };
}

/**
 * Test-only helper: replace the entire snapshot. Production code should
 * always go through reloadConfig().
 */
export function __resetConfigForTests(snapshot: ConfigSnapshot): void {
  current = { ...snapshot };
}
