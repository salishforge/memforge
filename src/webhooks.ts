// MemForge — Webhook event system
//
// Fire-and-forget POST to configured WEBHOOK_URL on memory lifecycle events.
// Events: consolidated, revised, reflected, evicted, graduated
//
// Config:
//   WEBHOOK_URL — Target URL (required to enable webhooks)
//   WEBHOOK_EVENTS — Comma-separated list of events to emit (default: all)

import { getLogger } from './logger.js';

const log = getLogger('webhooks');

export type WebhookEvent = 'consolidated' | 'revised' | 'reflected' | 'evicted' | 'graduated';

interface WebhookPayload {
  event: WebhookEvent;
  agent_id: string;
  data: Record<string, unknown>;
  timestamp: string;
}

let webhookUrl: string | null = null;
let enabledEvents: Set<WebhookEvent> | null = null;

export function configureWebhooks(url?: string, events?: string): void {
  webhookUrl = url ?? process.env['WEBHOOK_URL'] ?? null;
  if (!webhookUrl) return;

  const eventList = events ?? process.env['WEBHOOK_EVENTS'] ?? 'consolidated,revised,reflected,evicted,graduated';
  enabledEvents = new Set(eventList.split(',').map((e) => e.trim()) as WebhookEvent[]);
  log.info({ url: webhookUrl, events: [...enabledEvents] }, 'webhooks configured');
}

/**
 * Emit a webhook event. Fire-and-forget — never blocks, never throws.
 */
export function emitWebhookEvent(event: WebhookEvent, agentId: string, data: Record<string, unknown>): void {
  if (!webhookUrl || !enabledEvents?.has(event)) return;

  const payload: WebhookPayload = {
    event,
    agent_id: agentId,
    data,
    timestamp: new Date().toISOString(),
  };

  void fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(5000),
  }).catch((err) => {
    log.error({ err, event, agentId }, 'webhook delivery failed');
  });
}
