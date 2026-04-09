# MemForge Tools for Microsoft 365 Copilot

This document describes the memory capabilities available to M365 Copilot when MemForge is connected as an API plugin or via Power Automate. These tools give Copilot persistent memory across sessions — it can remember context from past conversations, emails, meetings, and decisions.

---

## How It Works

MemForge runs as a separate service that Copilot calls via HTTP. Memories are stored in PostgreSQL and searchable via semantic and keyword matching. The system actively manages knowledge quality — detecting outdated information, resolving conflicts, and learning patterns over time.

**Data stays on your infrastructure.** MemForge runs wherever you deploy it. No memory data is sent to Microsoft or any third party unless you explicitly configure external LLM/embedding providers.

---

## Available Functions

### storeMemory

**Store information for future reference.** When a user shares something worth remembering — a preference, a decision, a fact, an error — store it.

| Parameter | Required | Description |
|-----------|----------|-------------|
| `agent_id` | Yes | Consistent identifier per user or context (e.g., user's email or team name) |
| `content` | Yes | What to remember — full sentences with context |
| `outcome_type` | No | `neutral` (default), `error`, `success`, `decision`, `observation` |

**Use cases in M365:**

| Scenario | Example Content | Outcome Type |
|----------|----------------|--------------|
| User states preference | "Sarah prefers weekly status reports on Friday mornings" | `observation` |
| Meeting decision | "Team decided to migrate from Azure SQL to Cosmos DB for the events service" | `decision` |
| Project update | "The Q3 launch date was moved from Sept 15 to Oct 1 due to security audit" | `observation` |
| Error learned from | "Deployment failed because we didn't run migrations before the code deploy" | `error` |
| Process established | "New PR review policy: all PRs need 2 approvals and passing CI" | `decision` |

**Best practices:**
- Store the **full context**, not just keywords. "Meeting with Sarah — decided to use Cosmos DB for events because SQL couldn't handle the write volume" is much more useful than "Cosmos DB".
- Mark errors with `outcome_type: "error"` — they get 2x priority in memory scoring because lessons from failures are the most valuable.
- Mark decisions with `outcome_type: "decision"` — they get 1.5x priority.
- Use a consistent `agent_id` per user or team. One user's memories shouldn't mix with another's.

---

### searchMemory

**Find relevant past knowledge.** Before answering a question or making a recommendation, search memory for relevant context.

| Parameter | Required | Description |
|-----------|----------|-------------|
| `agent_id` | Yes | Agent identifier |
| `query` | Yes | Natural language search — ask it like a question |
| `max_tokens` | No | Budget control — return results fitting within this many tokens |

**Use cases in M365:**

| User asks | Search query |
|-----------|-------------|
| "What did we decide about the database?" | "database decision migration" |
| "When is the Q3 launch?" | "Q3 launch date" |
| "What went wrong with the last deployment?" | "deployment error failure" |
| "What does Sarah prefer for reports?" | "Sarah report preferences" |
| "Remind me about the auth migration" | "authentication migration" |

**How search works:**

MemForge combines multiple retrieval strategies:
1. **Keyword matching** — finds exact terms in your memories
2. **Semantic matching** — finds conceptually similar content even with different wording
3. **Knowledge graph** — boosts results connected to entities mentioned in your query
4. **Temporal proximity** — recent memories rank higher when time context is present

The `max_tokens` parameter is especially useful for Copilot's context window — request only as many tokens of context as you need (e.g., 2000 for a brief answer, 8000 for a detailed synthesis).

---

### getContext

**Load session context.** Returns a structured bundle of the agent's most important memories, active rules, and open contradictions. Ideal for session warm-start.

| Parameter | Required | Description |
|-----------|----------|-------------|
| `agent_id` | Yes | Agent identifier |

**Returns:**
- **Top memories** — the 5 most important facts/decisions currently stored
- **Active procedures** — learned "if this then that" rules (e.g., "IF deploying on Friday THEN run extra validation")
- **Open contradictions** — conflicting information that needs resolution
- **Time since last activity** — how long since this agent was last active
- **Memory health** — overall quality metrics (importance, confidence, staleness)

**When to use:**
- At the start of every Copilot interaction that needs historical context
- When a user returns after a break: "What do I need to know?"
- Before a meeting: retrieve context about the meeting topic

---

### consolidateMemory

**Process recent memories into searchable long-term storage.** Raw memories stored by `storeMemory` go into a fast-write "hot tier" that isn't fully searchable. Consolidation processes them into the searchable "warm tier" with embeddings and importance scores.

| Parameter | Required | Description |
|-----------|----------|-------------|
| `agent_id` | Yes | Agent identifier |

**When to use:**
- At the end of a Copilot session or workflow
- After storing several related memories (e.g., after a meeting)
- On a schedule via Power Automate (recommended: nightly)

---

## Power Automate Integration Patterns

These patterns work without Copilot API Plugin registration — any M365 user can set them up.

### Pattern 1: Email Intelligence

**Trigger:** Important email arrives
**Action:** Store in MemForge with sender, subject, and preview

Now Copilot can answer "What did Alice email about last week?" — even if the Copilot session started after the email.

### Pattern 2: Pre-Meeting Briefing

**Trigger:** 5 minutes before calendar event
**Action:** Search MemForge for the meeting topic → send a Teams adaptive card with relevant context

The attendee walks into the meeting with a briefing card showing past decisions, action items, and context.

### Pattern 3: Meeting Follow-Up

**Trigger:** Teams meeting ends (or meeting notes posted)
**Action:** Store meeting summary in MemForge → consolidate

Meeting outcomes become part of the persistent knowledge base, searchable in future Copilot sessions.

### Pattern 4: Nightly Knowledge Maintenance

**Trigger:** Daily at 2:00 AM
**Action:** Consolidate → run sleep cycle

The sleep cycle scores memories by importance, detects stale knowledge, resolves contradictions, identifies patterns, and evicts low-value information. Knowledge quality improves overnight without human intervention.

### Pattern 5: Project Status Tracking

**Trigger:** Planner task completed or DevOps work item updated
**Action:** Store the status change as a memory with `outcome_type: "success"` or `"error"`

Copilot builds a history of project progress that persists across sessions: "What happened on the Alpha project this sprint?"

---

## Memory Quality Over Time

MemForge doesn't just store — it actively manages knowledge:

| Capability | What It Does | Why It Matters |
|-----------|-------------|----------------|
| **Staleness detection** | Flags memories not accessed or corroborated in 30+ days | Prevents acting on outdated information |
| **Conflict resolution** | When two memories contradict, determines which is current using recency, corroboration, and confidence | Prevents giving conflicting answers |
| **Knowledge gaps** | Tracks questions Copilot couldn't answer (zero search results) | Shows what the system doesn't know |
| **Schema detection** | Identifies repeated event patterns (A→B→C happening 3+ times) | Learns organizational workflows |
| **Surprise-based revision** | Prioritizes revising memories that led to unexpected negative outcomes | Learns from mistakes |
| **Confidence graduation** | Memories confirmed 3+ times with positive feedback become protected from eviction | Important knowledge survives long-term |

---

## Agent ID Strategy for M365

Use consistent, meaningful agent IDs to organize memory:

| Scope | Example agent_id | Use case |
|-------|-------------------|----------|
| Personal | `user-sarah@contoso.com` | Individual's preferences, decisions, context |
| Team | `team-backend` | Shared team knowledge, decisions, processes |
| Project | `project-alpha` | Project-specific history, decisions, milestones |
| Meeting series | `standup-backend-daily` | Recurring meeting context and action items |
| Workflow | `cicd-production` | Deployment history, errors, resolutions |

Different agent IDs keep memories isolated — a personal preference won't show up in a project query.

---

## Security & Privacy

- **Data residency:** MemForge runs on your infrastructure. Memory data stays wherever you deploy PostgreSQL.
- **Authentication:** API key or OAuth2 (Azure AD compatible). All endpoints require authentication.
- **Multi-tenant isolation:** Every query is scoped by `agent_id` with defense-in-depth (Row-Level Security available).
- **Content classification:** PII and secrets are detected and optionally redacted before storage.
- **Audit trail:** Every mutation is recorded in a cryptographically chained audit log (HMAC-SHA256).
- **9 security audit rounds** completed with all findings resolved.
