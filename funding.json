{
    "$schema": "https://fundingjson.org/schema/v1.1.0.json",
    "version": "v1.1.0",
    "entity": {
        "type": "individual",
        "role": "maintainer",
        "name": "John Brooke",
        "email": "john@salishforge.com",
        "description": "Solo maintainer building an open-source, MIT-licensed stack for long-running, multi-agent AI systems. The thesis is that frontier model labs are rightly focused on raw capability, but LLMs need a substrate that accumulates experience and revises beliefs over time to operate on human timelines. I'm building that substrate — security-first, zero-trust from day one — out of pocket on a modest VPS, with two autonomous agents running in production on the stack. Shipping weekly. Based in Seattle, WA.",
        "webpageUrl": {
            "url": "https://github.com/salishforge"
        }
    },
    "projects": [
        {
            "guid": "memforge",
            "name": "MemForge",
            "description": "Neuroscience-inspired memory system for AI agents. Unlike passive vector stores, MemForge treats memory quality as something that should actively improve over time. It runs a 10-phase 'sleep cycle' during idle periods: scoring, triage, conflict resolution, LLM-driven revision of low-confidence entries, graph maintenance, reflection, schema crystallization, meta-reflection, and gap analysis.\n\nScores 93.2% Recall@5 on LongMemEval (ICLR 2025) with p50 32ms / p95 47ms hybrid-search latency. Ships as a Docker standalone image, Python SDK, TypeScript SDK, and a 17-tool MCP server with integrations for Claude Desktop, Microsoft 365 Copilot, ChatGPT, LangChain, and CrewAI. Cleared 9 rounds of adversarial security review at MEDIUM+, with a published threat model, RLS, prompt-injection boundaries, SSRF prevention, and HMAC-chained audit logs.\n\nBuilt on PostgreSQL + pgvector (halfvec float16) with local embeddings via Transformers.js and Ollama support for fully self-hosted deployments.",
            "webpageUrl": {
                "url": "https://github.com/salishforge/memforge"
            },
            "repositoryUrl": {
                "url": "https://github.com/salishforge/memforge"
            },
            "licenses": ["spdx:MIT"],
            "tags": ["ai", "agents", "memory", "agent-memory", "mcp", "postgresql", "pgvector", "typescript", "knowledge-graph", "infrastructure"]
        },
        {
            "guid": "engram",
            "name": "Engram",
            "description": "Agent Memory Intelligence Benchmark. Existing benchmarks reward flashy retrieval metrics (Recall@k) that don't correlate with downstream task quality. Engram measures what actually matters: does the agent perform its job better with this memory system than without it?\n\nA three-tier evaluation framework weighted 20/40/40: retrieval quality, knowledge management (temporal accuracy, contradiction resolution, long-horizon retention, staleness detection, context efficiency), and actual agent task performance delta. Adapter-based architecture so any memory system can participate by implementing four methods. Positioned to fill gaps in existing benchmarks including LongMemEval, LoCoMo, MemoryAgentBench, and MEMTRACK.\n\nMaintained deliberately alongside MemForge so my own system — and competitors — can be evaluated honestly and publicly.",
            "webpageUrl": {
                "url": "https://github.com/salishforge/engram"
            },
            "repositoryUrl": {
                "url": "https://github.com/salishforge/engram"
            },
            "licenses": ["spdx:MIT"],
            "tags": ["ai", "agents", "benchmark", "evaluation", "agent-memory", "memory", "llm", "research", "infrastructure"]
        }
    ],
    "funding": {
        "channels": [
            {
                "guid": "direct-email",
                "type": "other",
                "address": "john@salishforge.com",
                "description": "For grants, compute credits, corporate sponsorships, or larger direct transfers. Reach out via email and I'll route to the appropriate payment method."
            },
            {
                "guid": "github-sponsors",
                "type": "payment-provider",
                "address": "https://github.com/sponsors/salishforge",
                "description": "Recurring and one-time sponsorships via GitHub Sponsors. Supports all tiered plans below."
            }
        ],
        "plans": [
            {
                "guid": "goodwill",
                "status": "active",
                "name": "Goodwill",
                "description": "Any amount, one-time. Every dollar offsets inference costs so development doesn't pause for weekly rate limits to reset.",
                "amount": 0,
                "currency": "USD",
                "frequency": "one-time",
                "channels": ["github-sponsors", "direct-email"]
            },
            {
                "guid": "supporter",
                "status": "active",
                "name": "Supporter",
                "description": "Helps cover monthly inference costs that would otherwise throttle development.",
                "amount": 5,
                "currency": "USD",
                "frequency": "monthly",
                "channels": ["github-sponsors"]
            },
            {
                "guid": "builder",
                "status": "active",
                "name": "Builder",
                "description": "Name or handle listed in project READMEs. Early access to benchmark write-ups and design notes.",
                "amount": 25,
                "currency": "USD",
                "frequency": "monthly",
                "channels": ["github-sponsors"]
            },
            {
                "guid": "sustainer",
                "status": "active",
                "name": "Sustainer",
                "description": "Everything in Builder, plus a direct channel for integration questions about MemForge, Engram, or Hyphae.",
                "amount": 100,
                "currency": "USD",
                "frequency": "monthly",
                "channels": ["github-sponsors"]
            },
            {
                "guid": "company-sponsor",
                "status": "active",
                "name": "Company Sponsor",
                "description": "Company logo in project READMEs and release notes. Priority integration support. Quarterly 30-minute call to discuss roadmap and your needs.",
                "amount": 500,
                "currency": "USD",
                "frequency": "monthly",
                "channels": ["github-sponsors", "direct-email"]
            },
            {
                "guid": "annual-infrastructure",
                "status": "active",
                "name": "Annual Infrastructure Grant",
                "description": "Covers one full year of infrastructure and inference costs: Claude Max subscription, open-weight GPU compute for benchmark runs, targeted proprietary API runs for comparative data, and VPS hosting. Ideal for grant programs or corporate sponsors looking to fund a full development year.",
                "amount": 15000,
                "currency": "USD",
                "frequency": "yearly",
                "channels": ["direct-email"]
            }
        ],
        "history": [
            {
                "year": 2026,
                "income": 0,
                "expenses": 500,
                "currency": "USD",
                "description": "Fully self-funded since project inception in March 2026. Approximately $500 in out-of-pocket LLM inference and infrastructure costs to date, with deliberate development pauses to let weekly rate limits reset. Does not yet include compute costs for intensive benchmarking, load testing, or model training."
            }
        ]
    }
}
