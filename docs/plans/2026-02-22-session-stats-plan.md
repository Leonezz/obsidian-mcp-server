# Active Session Stats — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Track active MCP sessions with client identification and per-session tool usage stats, exposed via settings UI and a new `list_sessions` MCP tool.

**Architecture:** Extend the existing `ActiveSession` interface in `src/server.ts` with `connectedAt`, `clientName`, `clientVersion`, and `toolStats` fields. Extract `clientInfo` from the MCP `initialize` request body, with an optional `X-Client-Name` header override. Add a public `getSessionSummaries()` method on `McpHttpServer` for the settings UI and a `recordSessionToolCall()` method for per-session stat tracking. Create a new `list_sessions` MCP tool.

**Tech Stack:** TypeScript, Express, `@modelcontextprotocol/sdk`, Obsidian Plugin API, Jest

**Design doc:** `docs/plans/2026-02-22-session-stats-design.md`

---

### Task 1: Extend `ActiveSession` interface and session creation

**Files:**
- Modify: `src/server.ts:23-27` (ActiveSession interface)
- Modify: `src/server.ts:228-233` (session creation in handleMcpRequest)
- Modify: `src/server.ts:1` (add ToolUsageStats import)

**Step 1: Add new fields to `ActiveSession` interface**

In `src/server.ts`, update the interface at line 23:

```typescript
interface ActiveSession {
    transport: StreamableHTTPServerTransport;
    mcp: McpServer;
    lastAccess: number;
    connectedAt: number;
    clientName: string;
    clientVersion: string;
    toolStats: ToolUsageStats;
}
```

Add import at top of file:
```typescript
import type { ToolUsageStats } from './types';
```

**Step 2: Extract clientInfo from initialize request and populate new fields**

In `src/server.ts`, at the session creation block (line 228-233), extract `clientInfo` from the request body before creating the transport. The initialize request body has the shape `{ params: { clientInfo: { name, version } } }`.

Replace the `onsessioninitialized` callback and surrounding code:

```typescript
// Extract client info from initialize request
const clientNameHeader = req.headers['x-client-name'] as string | undefined;
const initBody = Array.isArray(req.body)
    ? req.body.find((msg: Record<string, unknown>) => isInitializeRequest(msg))
    : req.body;
const clientInfo = (initBody?.params as Record<string, unknown>)?.clientInfo as
    { name?: string; version?: string } | undefined;
const clientName = clientNameHeader || clientInfo?.name || 'Unknown';
const clientVersion = clientInfo?.version || '';

const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => crypto.randomUUID(),
    onsessioninitialized: (id: string) => {
        this.sessions.set(id, {
            transport,
            mcp,
            lastAccess: Date.now(),
            connectedAt: Date.now(),
            clientName,
            clientVersion,
            toolStats: {},
        });
    },
});
```

**Step 3: Build and verify no type errors**

Run: `npm run build`
Expected: Clean build, no errors.

**Step 4: Commit**

```bash
git add src/server.ts
git commit -m "feat: extend ActiveSession with client info and per-session stats fields"
```

---

### Task 2: Add `getSessionSummaries()` and `recordSessionToolCall()` methods

**Files:**
- Modify: `src/server.ts` (add two public methods to `McpHttpServer`)
- Modify: `src/types.ts` (add `SessionSummary` interface)

**Step 1: Add `SessionSummary` type to `src/types.ts`**

After the existing `ContentSearchResult` interface (line 100), add:

```typescript
export interface SessionSummary {
    sessionId: string;
    clientName: string;
    clientVersion: string;
    connectedAt: string;
    lastActiveAt: string;
    durationSeconds: number;
    toolCalls: {
        total: number;
        successful: number;
        failed: number;
        byTool: ToolUsageStats;
    };
}
```

**Step 2: Add `getSessionSummaries()` method on `McpHttpServer`**

Add this public method to the `McpHttpServer` class (after `setSubscriptionManager`, around line 39):

```typescript
getSessionSummaries(): SessionSummary[] {
    const now = Date.now();
    const summaries: SessionSummary[] = [];
    for (const [id, session] of this.sessions) {
        const totals = Object.values(session.toolStats).reduce(
            (acc, s) => ({
                total: acc.total + s.total,
                successful: acc.successful + s.successful,
                failed: acc.failed + s.failed,
            }),
            { total: 0, successful: 0, failed: 0 },
        );
        summaries.push({
            sessionId: id.slice(-8),
            clientName: session.clientName,
            clientVersion: session.clientVersion,
            connectedAt: new Date(session.connectedAt).toISOString(),
            lastActiveAt: new Date(session.lastAccess).toISOString(),
            durationSeconds: Math.round((now - session.connectedAt) / 1000),
            toolCalls: {
                ...totals,
                byTool: session.toolStats,
            },
        });
    }
    return summaries;
}
```

Import `SessionSummary` at the top of `src/server.ts`:
```typescript
import type { ToolUsageStats, SessionSummary } from './types';
```

**Step 3: Add `recordSessionToolCall()` method on `McpHttpServer`**

This method records a tool call against a specific session's stats. Add to `McpHttpServer`:

```typescript
recordSessionToolCall(sessionId: string, toolName: string, success: boolean): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    session.toolStats = recordToolCall(session.toolStats, toolName);
    if (success) {
        session.toolStats = recordToolSuccess(session.toolStats, toolName);
    } else {
        session.toolStats = recordToolFailure(session.toolStats, toolName);
    }
}
```

Import the stat helper functions at the top of `src/server.ts`:
```typescript
import { recordToolCall, recordToolSuccess, recordToolFailure } from './stats';
```

**Step 4: Build and verify**

Run: `npm run build`
Expected: Clean build.

**Step 5: Commit**

```bash
git add src/server.ts src/types.ts
git commit -m "feat: add getSessionSummaries and recordSessionToolCall to McpHttpServer"
```

---

### Task 3: Wire per-session tool stats into `StatsTracker`

**Files:**
- Modify: `src/stats.ts` (add session callback support to `StatsTracker`)
- Modify: `src/main.ts` (pass session recording callback to StatsTracker)

**Step 1: Add optional session callback to `StatsTracker`**

The cleanest way to wire session stats is to give `StatsTracker` an optional callback that fires on each tool call result, which the server can use to update per-session stats.

In `src/stats.ts`, add a `sessionCallback` to the constructor and call it from `track()`:

```typescript
export class StatsTracker {
    private dirty = false;
    private debounceTimer: ReturnType<typeof setTimeout> | null = null;
    private onToolResult: ((toolName: string, success: boolean) => void) | null = null;

    constructor(
        private getStats: () => ToolUsageStats,
        private setStats: (stats: ToolUsageStats) => void,
        private persist: () => Promise<void>,
    ) {}

    setOnToolResult(callback: (toolName: string, success: boolean) => void): void {
        this.onToolResult = callback;
    }

    track<T, A extends unknown[]>(toolName: string, handler: (...args: A) => Promise<T>): (...args: A) => Promise<T> {
        return async (...args: A) => {
            this.setStats(recordToolCall(this.getStats(), toolName));
            try {
                const result = await handler(...args);
                this.setStats(recordToolSuccess(this.getStats(), toolName));
                this.scheduleSave();
                this.onToolResult?.(toolName, true);
                return result;
            } catch (err) {
                this.setStats(recordToolFailure(this.getStats(), toolName));
                this.scheduleSave();
                this.onToolResult?.(toolName, false);
                throw err;
            }
        };
    }

    // ... scheduleSave and flush unchanged
}
```

**Step 2: Wire the callback in `src/main.ts`**

However, there's a challenge: at tool-call time, we need the session ID to call `server.recordSessionToolCall()`. The MCP SDK's tool handler doesn't receive the session ID directly. We need to find which session's `McpServer` is executing the handler.

**Better approach:** Instead of using a callback on `StatsTracker`, hook into tool calls at the server level. Each session has its own `McpServer` instance. We can maintain a reverse map from `McpServer` to session ID and use an `onToolResult` callback.

Let's revise: add a `Map<McpServer, string>` to `McpHttpServer` and register each session. Then add a `getSessionIdForMcp()` helper. But the tool handlers don't receive the `McpServer` instance either.

**Simplest correct approach:** The `McpServer` SDK tool handler receives `extra` as a second argument with `{ authInfo, requestId, sessionId }` — let's check if `sessionId` is available in the handler callback. Looking at the MCP SDK, the `RegisteredTool` callback receives `(args, extra)` where `extra` includes `sessionId` if the transport supports it.

Actually, looking at the tool registration pattern more carefully — `mcp.registerTool()` callback receives `(params, extra)`. The `extra` object from `StreamableHTTPServerTransport` includes `sessionId`. So we can pass it through.

**Revised Step 1: Make `StatsTracker.track()` session-aware**

The `track()` wrapper needs access to the session ID at call time. Since the MCP SDK passes `extra.sessionId` to tool handlers, but `track()` wraps the handler without knowing the arg shape, we'll use a different approach:

Add a method `trackWithSession()` that accepts a handler whose last argument contains `sessionId`:

Actually, the simplest approach: since `track()` wraps the handler generically, and the actual MCP tool callback signature is `(args, extra) => result`, we just need `StatsTracker` to accept a session recorder callback. The session ID comes from the `extra` object that's already passed through `track()`.

**Let's look at the actual call chain:**
1. `mcp.registerTool('read_note', schema, tracker.track('read_note', async ({ path }) => ...))`
2. The SDK calls the callback with `(params, extra)` where `extra.sessionId` exists
3. But `tracker.track()` wraps it as `(...args) => ...` — so `extra` IS passed through as the second arg

So the handler registered with the SDK receives `(params, extra)`, and `track()` forwards all args. The tool-level handler only destructures `params` (the first arg), but `extra` is silently forwarded.

We can capture `extra.sessionId` inside `track()` by inspecting the second argument:

```typescript
track<T, A extends unknown[]>(toolName: string, handler: (...args: A) => Promise<T>): (...args: A) => Promise<T> {
    return async (...args: A) => {
        this.setStats(recordToolCall(this.getStats(), toolName));
        // Extract sessionId from MCP extra arg (second argument if present)
        const extra = args[1] as { sessionId?: string } | undefined;
        const sessionId = extra?.sessionId;
        try {
            const result = await handler(...args);
            this.setStats(recordToolSuccess(this.getStats(), toolName));
            this.scheduleSave();
            if (sessionId) this.onToolResult?.(sessionId, toolName, true);
            return result;
        } catch (err) {
            this.setStats(recordToolFailure(this.getStats(), toolName));
            this.scheduleSave();
            if (sessionId) this.onToolResult?.(sessionId, toolName, false);
            throw err;
        }
    };
}
```

Update the `onToolResult` type:
```typescript
private onToolResult: ((sessionId: string, toolName: string, success: boolean) => void) | null = null;

setOnToolResult(callback: (sessionId: string, toolName: string, success: boolean) => void): void {
    this.onToolResult = callback;
}
```

**Step 2: Wire callback in `src/main.ts`**

After creating `mcpServer` and `statsTracker` in `onload()`, connect them:

```typescript
this.statsTracker.setOnToolResult((sessionId, toolName, success) => {
    this.mcpServer.recordSessionToolCall(sessionId, toolName, success);
});
```

Add this line after `this.mcpServer = new McpHttpServer(this);` (around line 33).

**Step 3: Build and verify**

Run: `npm run build`
Expected: Clean build.

**Step 4: Commit**

```bash
git add src/stats.ts src/main.ts
git commit -m "feat: wire per-session tool call recording via StatsTracker callback"
```

---

### Task 4: Write tests for per-session tool stats

**Files:**
- Modify: `tests/stats.test.ts` (add tests for session callback)

**Step 1: Write test — `onToolResult` fires with sessionId on success**

Add to `tests/stats.test.ts` in the `StatsTracker` describe block:

```typescript
test('onToolResult callback fires with sessionId on success', async () => {
    let stats: ToolUsageStats = {};
    const persist = jest.fn().mockResolvedValue(undefined);
    const tracker = new StatsTracker(
        () => stats,
        (s) => { stats = s; },
        persist,
    );

    const onToolResult = jest.fn();
    tracker.setOnToolResult(onToolResult);

    // Simulate MCP SDK call: handler receives (params, extra)
    const handler = tracker.track('read_note', async (_params: { path: string }) => {
        return { content: [{ type: 'text' as const, text: 'ok' }] };
    });

    await handler({ path: 'test.md' }, { sessionId: 'session-123' } as never);
    expect(onToolResult).toHaveBeenCalledWith('session-123', 'read_note', true);
    await tracker.flush();
});
```

**Step 2: Write test — `onToolResult` fires with sessionId on failure**

```typescript
test('onToolResult callback fires with sessionId on failure', async () => {
    let stats: ToolUsageStats = {};
    const persist = jest.fn().mockResolvedValue(undefined);
    const tracker = new StatsTracker(
        () => stats,
        (s) => { stats = s; },
        persist,
    );

    const onToolResult = jest.fn();
    tracker.setOnToolResult(onToolResult);

    const handler = tracker.track('fail_tool', async () => {
        throw new Error('boom');
    });

    await expect(handler({}, { sessionId: 'session-456' } as never)).rejects.toThrow('boom');
    expect(onToolResult).toHaveBeenCalledWith('session-456', 'fail_tool', false);
    await tracker.flush();
});
```

**Step 3: Write test — no callback when no `onToolResult` set**

```typescript
test('track works without onToolResult callback', async () => {
    let stats: ToolUsageStats = {};
    const persist = jest.fn().mockResolvedValue(undefined);
    const tracker = new StatsTracker(
        () => stats,
        (s) => { stats = s; },
        persist,
    );

    // No setOnToolResult called — should not throw
    const handler = tracker.track('tool', async () => {
        return { content: [] };
    });

    await handler({}, { sessionId: 'session-789' } as never);
    expect(stats.tool.successful).toBe(1);
    await tracker.flush();
});
```

**Step 4: Write test — no sessionId in extra arg**

```typescript
test('onToolResult not called when no sessionId in extra', async () => {
    let stats: ToolUsageStats = {};
    const persist = jest.fn().mockResolvedValue(undefined);
    const tracker = new StatsTracker(
        () => stats,
        (s) => { stats = s; },
        persist,
    );

    const onToolResult = jest.fn();
    tracker.setOnToolResult(onToolResult);

    const handler = tracker.track('tool', async () => {
        return { content: [] };
    });

    // Call with no extra arg (legacy style)
    await handler();
    expect(onToolResult).not.toHaveBeenCalled();
    await tracker.flush();
});
```

**Step 5: Run tests**

Run: `npm test -- tests/stats.test.ts`
Expected: All tests pass.

**Step 6: Commit**

```bash
git add tests/stats.test.ts
git commit -m "test: add per-session tool call callback tests"
```

---

### Task 5: Create `list_sessions` MCP tool

**Files:**
- Create: `src/tools/list-sessions.ts`
- Modify: `src/tools/index.ts` (register new tool)
- Modify: `src/main.ts` (expose server reference for tools)

**Step 1: Expose `mcpServer` as public on `McpPlugin`**

In `src/main.ts`, change `private mcpServer` to `public mcpServer` (line 15):

```typescript
mcpServer!: McpHttpServer;
```

Remove the `private` keyword.

**Step 2: Create `src/tools/list-sessions.ts`**

```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type McpPlugin from '../main';
import type { StatsTracker } from '../stats';
import type { McpLogger } from '../logging';
import { READ_ONLY_ANNOTATIONS } from './constants';

export function registerListSessions(mcp: McpServer, plugin: McpPlugin, tracker: StatsTracker, logger: McpLogger): void {
    mcp.registerTool('list_sessions', {
        description: 'List active MCP sessions with client info and per-session tool usage stats.',
        annotations: READ_ONLY_ANNOTATIONS,
        inputSchema: {},
    }, tracker.track('list_sessions', async () => {
        const summaries = plugin.mcpServer.getSessionSummaries();
        logger.info('list_sessions', { count: summaries.length });
        return {
            content: [{
                type: 'text' as const,
                text: JSON.stringify(summaries, null, 2),
            }],
        };
    }));
}
```

**Step 3: Register in `src/tools/index.ts`**

Add import:
```typescript
import { registerListSessions } from './list-sessions';
```

Add registration call at the end of `registerTools()`:
```typescript
registerListSessions(mcp, plugin, tracker, logger);
```

**Step 4: Build and verify**

Run: `npm run build`
Expected: Clean build.

**Step 5: Commit**

```bash
git add src/tools/list-sessions.ts src/tools/index.ts src/main.ts
git commit -m "feat: add list_sessions MCP tool"
```

---

### Task 6: Add "Active Sessions" section to settings UI

**Files:**
- Modify: `src/settings.ts` (add renderSessionsSection method)

**Step 1: Add `renderSessionsSection()` method**

In `src/settings.ts`, add a new method and call it from `display()`. Add it before `renderStatsSection()`:

```typescript
private renderSessionsSection(containerEl: HTMLElement): void {
    containerEl.createEl('h3', { text: 'Active Sessions' });

    const summaries = this.plugin.mcpServer.getSessionSummaries();

    if (summaries.length === 0) {
        containerEl.createEl('p', {
            text: 'No active sessions.',
            cls: 'mcp-stats-empty',
        });
        return;
    }

    const table = containerEl.createEl('table', { cls: 'mcp-stats-table' });
    const thead = table.createEl('thead');
    const headerRow = thead.createEl('tr');
    headerRow.createEl('th', { text: 'Client' });
    headerRow.createEl('th', { text: 'Session ID' });
    headerRow.createEl('th', { text: 'Connected' });
    headerRow.createEl('th', { text: 'Last Active' });
    headerRow.createEl('th', { text: 'Tool Calls' });

    const tbody = table.createEl('tbody');
    for (const s of summaries) {
        const row = tbody.createEl('tr');
        const clientLabel = s.clientVersion
            ? `${s.clientName} (${s.clientVersion})`
            : s.clientName;
        row.createEl('td', { text: clientLabel });
        row.createEl('td', { text: `...${s.sessionId}` });
        row.createEl('td', { text: this.formatRelativeTime(s.connectedAt) });
        row.createEl('td', { text: this.formatRelativeTime(s.lastActiveAt) });
        row.createEl('td', { text: String(s.toolCalls.total) });
    }
}
```

**Step 2: Add `formatRelativeTime()` helper**

```typescript
private formatRelativeTime(isoString: string): string {
    const diff = Date.now() - new Date(isoString).getTime();
    const seconds = Math.floor(diff / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ago`;
}
```

**Step 3: Call from `display()`**

In `display()`, add this line before the existing `this.renderStatsSection(containerEl);` call (before line 206):

```typescript
this.renderSessionsSection(containerEl);
```

**Step 4: Build and verify**

Run: `npm run build`
Expected: Clean build.

**Step 5: Commit**

```bash
git add src/settings.ts
git commit -m "feat: add Active Sessions section to settings UI"
```

---

### Task 7: Write tests for `getSessionSummaries()` and `recordSessionToolCall()`

**Files:**
- Create: `tests/server-sessions.test.ts`

**Step 1: Write test file**

Since `McpHttpServer` depends on Express and Obsidian, we test `getSessionSummaries()` and `recordSessionToolCall()` by accessing the sessions map directly. We'll test the public methods indirectly by manipulating the internal state.

Actually, the methods are public and work on the `sessions` Map. The simplest approach: test by creating a minimal mock and directly calling the methods. But `sessions` is private.

Better approach: write integration-style tests that verify the data model. Since the session map is private, we test through the public API — create a server, manually add session data, and verify summaries.

For practical testing, we'll make `sessions` accessible for testing or test the pure logic. Let's add a `get sessionCount()` accessor too for the settings UI.

**Revised approach:** Extract the summary-building logic into a testable pure function, similar to how stats uses pure functions. But for now, the simplest path is testing through the MCP tool itself or via the stats callback chain we already tested in Task 4.

Create `tests/server-sessions.test.ts` with focused tests on the `recordSessionToolCall` behavior through the callback chain:

```typescript
import { recordToolCall, recordToolSuccess, recordToolFailure } from '../src/stats';
import type { ToolUsageStats } from '../src/types';

describe('session tool stats recording', () => {
    test('recordSessionToolCall equivalent: records call + success', () => {
        let stats: ToolUsageStats = {};
        stats = recordToolCall(stats, 'read_note');
        stats = recordToolSuccess(stats, 'read_note');

        expect(stats.read_note).toEqual({ total: 1, successful: 1, failed: 0 });
    });

    test('recordSessionToolCall equivalent: records call + failure', () => {
        let stats: ToolUsageStats = {};
        stats = recordToolCall(stats, 'read_note');
        stats = recordToolFailure(stats, 'read_note');

        expect(stats.read_note).toEqual({ total: 1, successful: 0, failed: 1 });
    });

    test('session summary aggregation logic', () => {
        const toolStats: ToolUsageStats = {
            read_note: { total: 5, successful: 4, failed: 1 },
            list_folder: { total: 3, successful: 3, failed: 0 },
        };

        const totals = Object.values(toolStats).reduce(
            (acc, s) => ({
                total: acc.total + s.total,
                successful: acc.successful + s.successful,
                failed: acc.failed + s.failed,
            }),
            { total: 0, successful: 0, failed: 0 },
        );

        expect(totals).toEqual({ total: 8, successful: 7, failed: 1 });
    });

    test('session summary with empty toolStats', () => {
        const toolStats: ToolUsageStats = {};
        const totals = Object.values(toolStats).reduce(
            (acc, s) => ({
                total: acc.total + s.total,
                successful: acc.successful + s.successful,
                failed: acc.failed + s.failed,
            }),
            { total: 0, successful: 0, failed: 0 },
        );

        expect(totals).toEqual({ total: 0, successful: 0, failed: 0 });
    });
});
```

**Step 2: Run tests**

Run: `npm test -- tests/server-sessions.test.ts`
Expected: All tests pass.

**Step 3: Run full test suite**

Run: `npm test`
Expected: All tests pass.

**Step 4: Commit**

```bash
git add tests/server-sessions.test.ts
git commit -m "test: add session stats aggregation tests"
```

---

### Task 8: Update CLAUDE.md and run final verification

**Files:**
- Modify: `CLAUDE.md` (update tool table and architecture docs)

**Step 1: Update the MCP Tools table in CLAUDE.md**

Add `list_sessions` to the tool table:

```
| `list_sessions` | List active sessions with client info and per-session tool stats |
```

**Step 2: Update the Architecture section**

In the "Data Persistence" subsection or a new "Session Tracking" note, add:

```
### Session Tracking

Active sessions are tracked in-memory via the `ActiveSession` interface in `src/server.ts`. Each session stores `connectedAt`, `clientName`, `clientVersion`, and per-session `toolStats`. Client name is extracted from the MCP `initialize` request's `clientInfo.name` field, with an optional `X-Client-Name` header override. Session data is not persisted — it exists only while sessions are active.
```

**Step 3: Run full build and tests**

Run: `npm run build && npm test && npm run lint`
Expected: All pass cleanly.

**Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md with session stats feature"
```

---

## Summary of Changes

| File | Change |
|------|--------|
| `src/server.ts` | Extend `ActiveSession`, extract clientInfo, add `getSessionSummaries()`, `recordSessionToolCall()` |
| `src/types.ts` | Add `SessionSummary` interface |
| `src/stats.ts` | Add `setOnToolResult()` callback, extract sessionId in `track()` |
| `src/main.ts` | Wire session callback, make `mcpServer` public |
| `src/tools/list-sessions.ts` | **New** — `list_sessions` MCP tool |
| `src/tools/index.ts` | Register `list_sessions` |
| `src/settings.ts` | Add "Active Sessions" section with table |
| `tests/stats.test.ts` | Add session callback tests |
| `tests/server-sessions.test.ts` | **New** — session stats aggregation tests |
| `CLAUDE.md` | Update tool table and architecture docs |
