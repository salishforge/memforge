---
expect:
  agent_id: alice
  namespace: string
  q: string
---
[
  {"id": "41", "content": "[user]: Let's drop Redis from the dev stack, it keeps breaking onboarding.\n[assistant]: Decision (2026-09-02, billing-api): dev stack runs without Redis; cache falls back to in-process. Reason: three onboarding failures in August. Revisit if p95 latency passes 200 ms.", "metadata": {"source": "claude"}, "occurred_at": "2026-09-02T15:00:00Z", "time_start": "2026-09-02T15:00:00Z", "consolidated_at": "2026-09-02T16:00:00Z", "rank": 0.82, "epistemic_status": "provisional"},
  {"id": "18", "content": "[assistant]: Note (2026-06-11, billing-api): Redis is used for the rate limiter in production only.", "metadata": {}, "occurred_at": null, "time_start": "2026-06-11T09:00:00Z", "consolidated_at": "2026-06-11T10:00:00Z", "rank": 0.31, "epistemic_status": "provisional"}
]
