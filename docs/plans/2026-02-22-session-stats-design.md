# Active Session Stats Design

**Date:** 2026-02-22
**Status:** Approved

## Goal

Add active session tracking with client identification and per-session tool usage stats. Expose via both the settings UI and a new `list_sessions` MCP tool.

## Decisions

- **Approach:** Extend existing `ActiveSession` interface (Approach A) — minimal new code, automatic cleanup on session close
- **Client ID:** Extract `clientInfo` from MCP initialize request; allow `X-Client-Name` header override
- **Scope:** Active sessions only — no persistence after session ends
- **Visibility:** Settings tab section + new `list_sessions` MCP tool

## Data Model

Extend `ActiveSession` in `src/server.ts`:

```typescript
interface ActiveSession {
  transport: StreamableHTTPServerTransport;
  mcp: McpServer;
  lastAccess: number;        // existing — updated on every request
  connectedAt: number;       // NEW — timestamp when session created
  clientName: string;        // NEW — from clientInfo.name or X-Client-Name header
  clientVersion: string;     // NEW — from clientInfo.version
  toolStats: ToolUsageStats; // NEW — per-session tool call breakdown
}
```

Reuses existing `ToolUsageStats` type (`Record<string, { total, successful, failed }>`).

## Client Identification

1. Parse `params.clientInfo.name` and `params.clientInfo.version` from the `initialize` request body
2. Check for optional `X-Client-Name` header — overrides `clientInfo.name` if present
3. Defaults: `"Unknown"` for name, `""` for version

## Per-Session Tool Stats

- Each tool call updates both global stats (existing) and the session's `toolStats`
- Session ID must be available at tool-call time to look up the `ActiveSession`
- Use the same immutable update helpers from `src/stats.ts`

## New MCP Tool: `list_sessions`

File: `src/tools/list-sessions.ts`

Returns array of session info objects:

```typescript
{
  sessionId: string;        // truncated (last 8 chars) for security
  clientName: string;
  clientVersion: string;
  connectedAt: string;      // ISO timestamp
  lastActiveAt: string;     // ISO timestamp
  durationSeconds: number;  // derived
  toolCalls: {
    total: number;
    successful: number;
    failed: number;
    byTool: ToolUsageStats;
  }
}
```

## Settings UI

New "Active Sessions" section in `McpSettingTab`:
- Table columns: Client, Session ID (truncated), Connected, Last Active, Tool Calls
- Shows "No active sessions" when empty
- Reads from server's session map when tab opens

## Files to Modify

1. `src/server.ts` — Extend `ActiveSession`, capture clientInfo at initialize, add method to get session summaries, record per-session tool stats
2. `src/tools/list-sessions.ts` — New file for `list_sessions` MCP tool
3. `src/tools/index.ts` — Register `list_sessions` tool
4. `src/settings.ts` — Add "Active Sessions" UI section
5. `src/types.ts` — Add any new type exports if needed
6. `tests/` — Tests for session stats tracking and the new tool
