// LongMemEval dataset downloader
//
// Fetches the dataset from GitHub and validates its shape.
// Usage: npx tsx benchmarks/longmemeval/download.ts [--force]

import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadConfig } from '../lib/config.js';
import type { LongMemEvalInstance } from './types.js';

// Dataset hosted on HuggingFace (not in the GitHub repo itself)
const DATASET_URLS: Record<string, string> = {
  'longmemeval_s.json': 'https://huggingface.co/datasets/xiaowu0162/longmemeval-cleaned/resolve/main/longmemeval_s_cleaned.json',
  'longmemeval_oracle.json': 'https://huggingface.co/datasets/xiaowu0162/longmemeval-cleaned/resolve/main/longmemeval_oracle.json',
};

function validate(data: unknown[], filename: string): void {
  console.log(`  ${filename}: ${data.length} instances`);
  const sample = data[0] as Record<string, unknown> | undefined;
  if (!sample) throw new Error(`${filename} is empty`);

  const required = ['question', 'answer', 'haystack_sessions', 'haystack_session_ids'];
  for (const key of required) {
    if (!(key in sample)) {
      throw new Error(`${filename} missing required field: ${key}`);
    }
  }

  // Count question types
  const types = new Map<string, number>();
  for (const item of data) {
    const inst = item as LongMemEvalInstance;
    const t = inst.question_type ?? 'unknown';
    types.set(t, (types.get(t) ?? 0) + 1);
  }
  for (const [type, count] of types) {
    console.log(`    ${type}: ${count}`);
  }
}

async function downloadFile(url: string, destPath: string): Promise<boolean> {
  console.log(`  Fetching ${url}...`);
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(60_000) });
    if (!response.ok) {
      console.log(`  HTTP ${response.status} — skipping`);
      return false;
    }
    const text = await response.text();
    writeFileSync(destPath, text, 'utf-8');
    return true;
  } catch (err) {
    console.log(`  Download failed: ${(err as Error).message}`);
    return false;
  }
}


export async function main(): Promise<void> {
  const config = loadConfig();
  const force = process.argv.includes('--force');

  console.log('=== LongMemEval Dataset Download ===');
  mkdirSync(config.datasetDir, { recursive: true });

  const mainFile = join(config.datasetDir, 'longmemeval_s.json');
  if (existsSync(mainFile) && !force) {
    console.log(`Dataset already exists at ${mainFile}. Use --force to re-download.`);
    const data = JSON.parse(readFileSync(mainFile, 'utf-8')) as unknown[];
    validate(data, 'longmemeval_s.json');
    return;
  }

  // Download from HuggingFace
  for (const [localName, url] of Object.entries(DATASET_URLS)) {
    const destPath = join(config.datasetDir, localName);
    if (existsSync(destPath) && !force) {
      console.log(`  ${localName} already exists, skipping`);
      continue;
    }
    if (!await downloadFile(url, destPath)) {
      throw new Error(`Failed to download ${localName} from HuggingFace. Check network and try again.`);
    }
  }

  // Validate downloaded files
  if (existsSync(mainFile)) {
    const data = JSON.parse(readFileSync(mainFile, 'utf-8')) as unknown[];
    validate(data, 'longmemeval_s.json');
  }

  const oracleFile = join(config.datasetDir, 'longmemeval_oracle.json');
  if (existsSync(oracleFile)) {
    const data = JSON.parse(readFileSync(oracleFile, 'utf-8')) as unknown[];
    validate(data, 'longmemeval_oracle.json');
  }

  console.log('Download complete.');
}

// Run if invoked directly
main().catch((err) => {
  console.error('Download failed:', (err as Error).message);
  process.exit(1);
});
