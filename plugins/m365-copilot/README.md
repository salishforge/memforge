# MemForge for Microsoft 365 Copilot

Persistent long-term memory for M365 Copilot agents via API Plugin or Power Automate.

## Option A: Copilot API Plugin (recommended)

Register MemForge as a Copilot skill that any M365 Copilot agent can call.

### Prerequisites

- MemForge deployed with HTTPS (e.g., behind nginx/Caddy reverse proxy)
- M365 admin access for plugin registration
- OAuth2 or API key authentication configured on MemForge

### 1. Deploy the Plugin Manifest

Copy `manifest.json` and `ai-plugin.json` to your MemForge deployment. The manifest points Copilot at MemForge's OpenAPI spec.

### 2. Register in Microsoft 365 Admin Center

1. Go to **admin.microsoft.com** → Settings → Integrated Apps
2. Upload the plugin manifest or point to `https://your-memforge/api/copilot-manifest.json`
3. Assign to users/groups who should have memory capabilities
4. Copilot will discover MemForge tools as skills

### 3. Use in Copilot

In any M365 Copilot conversation:

> "Store in memory: our Q3 deployment deadline is September 15th"

> "What do you remember about deployment deadlines?"

> "What has changed since last week?"

Copilot routes these to MemForge's `add`, `query`, and `timeline` endpoints.

---

## Option B: Power Automate (no admin required)

Create flows that connect M365 events to MemForge memory — works without admin plugin registration.

### Flow 1: Store Important Emails as Memories

**Trigger:** When a new email arrives tagged "Important"

**Action:** HTTP POST to MemForge

```
POST https://your-memforge:3333/memory/copilot-agent/add
Headers:
  Authorization: Bearer {your-token}
  Content-Type: application/json
Body:
{
  "content": "Email from @{triggerOutputs()?['body/from']} — Subject: @{triggerOutputs()?['body/subject']} — @{triggerOutputs()?['body/bodyPreview']}",
  "metadata": {"source": "outlook", "from": "@{triggerOutputs()?['body/from']}"},
  "outcome_type": "observation"
}
```

### Flow 2: Store Teams Meeting Notes

**Trigger:** When a Teams meeting ends

**Action:** HTTP POST to MemForge with meeting summary

### Flow 3: Retrieve Context Before Meetings

**Trigger:** 5 minutes before a calendar event

**Action:** HTTP GET from MemForge

```
GET https://your-memforge:3333/memory/copilot-agent/query?q={meeting subject}&mode=hybrid&max_tokens=2000
Headers:
  Authorization: Bearer {your-token}
```

**Action 2:** Send adaptive card to Teams with relevant memories

### Flow 4: Nightly Consolidation

**Trigger:** Recurrence — Daily at 2:00 AM

**Action:** HTTP POST

```
POST https://your-memforge:3333/memory/copilot-agent/consolidate
POST https://your-memforge:3333/memory/copilot-agent/sleep
```

### Import Templates

Import the pre-built flow templates from `power-automate-templates/`:
- `store-emails.json` — Email → MemForge
- `meeting-context.json` — Calendar → MemForge query → Teams card
- `nightly-consolidation.json` — Scheduled sleep cycle

---

## Option C: Copilot Studio Agent Builder

For custom Copilot agents with built-in memory:

1. Open **Copilot Studio** (copilotstudio.microsoft.com)
2. Create a new agent
3. Add an **HTTP action** for each MemForge operation:
   - **Store memory:** POST `/memory/{agent_id}/add`
   - **Search memory:** GET `/memory/{agent_id}/query?q={query}`
   - **Get context:** GET `/memory/{agent_id}/resume`
4. Configure the agent's system prompt to use retrieved memories as context

---

## Authentication

MemForge supports two auth modes for M365 integration:

**API Key (simplest):**
Set `MEMFORGE_TOKEN` on the server, include `Authorization: Bearer {token}` in all requests.

**OAuth2 (enterprise):**
Configure `OAUTH2_INTROSPECT_URL` to point to your Azure AD token introspection endpoint. M365 Copilot includes the user's Azure AD token which MemForge validates.

---

## Architecture

```
M365 Copilot / Teams / Outlook
        │
        ▼
  API Plugin or Power Automate
        │
        ▼ (HTTPS)
  MemForge Server
        │
        ▼
  PostgreSQL + pgvector
```

All M365 traffic goes through your MemForge deployment. No data is sent to third parties beyond what you configure (LLM/embedding providers).
