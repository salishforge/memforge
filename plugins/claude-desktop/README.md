# MemForge for Claude Desktop

Persistent long-term memory for Claude Desktop via MCP.

## Setup (2 minutes)

### 1. Start MemForge

```bash
# Easiest — Docker standalone (includes PostgreSQL)
docker run -p 3333:3333 salishforge/memforge:standalone

# Or manual
npm install && npm start
```

### 2. Configure Claude Desktop

Open Claude Desktop settings → Developer → Edit Config, or edit directly:

**macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "memforge": {
      "command": "npx",
      "args": ["memforge-mcp"],
      "env": {
        "MEMFORGE_URL": "http://localhost:3333",
        "MEMFORGE_TOKEN": ""
      }
    }
  }
}
```

### 3. Restart Claude Desktop

Claude now has 16 memory tools available. Test it:

> "Remember that I prefer dark mode and vim keybindings"

Claude will call `memforge_add` to store this. In your next session:

> "What are my preferences?"

Claude will call `memforge_query` to retrieve it.

## What Claude Can Do With Memory

| Say this | Claude calls |
|----------|-------------|
| "Remember that..." | `memforge_add` |
| "What do you know about X?" | `memforge_query` |
| "What happened recently?" | `memforge_timeline` |
| "Consolidate what you've learned" | `memforge_consolidate` |
| "What entities do you know?" | `memforge_entities` |
| "How is X related to Y?" | `memforge_graph` |
| "Reflect on what you've learned" | `memforge_reflect` |
| "Run a sleep cycle" | `memforge_sleep` |
| "How healthy is your memory?" | `memforge_health` |

## Recommended: Auto-Context Hooks

For the best experience, add hooks that automatically load context at session start and save memories at session end.

### Session Start Hook

Create `~/.claude/hooks.json` (or add to existing):

```json
{
  "hooks": [
    {
      "event": "session_start",
      "command": "curl -s http://localhost:3333/memory/claude-desktop/resume?limit=5 | jq -r '.data.top_memories[].content' 2>/dev/null"
    }
  ]
}
```

This injects your 5 most important memories into Claude's context at the start of every session.

### Session End Hook

```json
{
  "hooks": [
    {
      "event": "session_end",
      "command": "curl -s -X POST http://localhost:3333/memory/claude-desktop/consolidate -H 'Content-Type: application/json' -d '{}' 2>/dev/null"
    }
  ]
}
```

This consolidates any memories stored during the session.

## Multi-Agent Setup

Use different agent IDs for different Claude contexts:

```json
{
  "mcpServers": {
    "memforge-personal": {
      "command": "npx",
      "args": ["memforge-mcp"],
      "env": {
        "MEMFORGE_URL": "http://localhost:3333",
        "MEMFORGE_AGENT_ID": "claude-personal"
      }
    },
    "memforge-work": {
      "command": "npx",
      "args": ["memforge-mcp"],
      "env": {
        "MEMFORGE_URL": "http://localhost:3333",
        "MEMFORGE_AGENT_ID": "claude-work"
      }
    }
  }
}
```

## Troubleshooting

**"No memory tools available"** — Restart Claude Desktop after editing config. Check that MemForge is running: `curl http://localhost:3333/health`

**"Connection refused"** — MemForge isn't running. Start it with `docker run -p 3333:3333 salishforge/memforge:standalone`

**"Memories not persisting"** — Memories go to the hot tier first. Run consolidation (say "consolidate your memories" or wait for the session end hook).
