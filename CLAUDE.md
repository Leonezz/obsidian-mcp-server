# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Obsidian MCP Server is an **Obsidian desktop plugin** that runs a local Model Context Protocol (MCP) server inside Obsidian. External AI tools (Claude Desktop, Cursor, CLI agents) connect via Streamable HTTP to read vault content and perform actions. The plugin is desktop-only and requires Bearer token authentication.

## Build & Development Commands

```bash
npm run dev        # Watch mode (esbuild, outputs main.js)
npm run build      # Production build (esbuild, outputs main.js)
npm run lint       # ESLint on src/**/*.ts
npm test           # Jest tests
```

The build output is `main.js` in the project root (not a dist/ folder). This is the file Obsidian loads as the plugin entry point.

## Architecture

**Modular plugin** — code is organized across focused modules in `src/`. Key classes and modules:

1. **`McpPlugin`** (`src/main.ts`) — Entry point. Manages plugin lifecycle, settings + stats persistence, Express server, and MCP tool registration.
2. **`SecurityManager`** (`src/security.ts`) — Enforces access control via a blacklist system. Two rule types:
   - **Path rules**: prefix-match on vault paths (e.g., `Secret/` blocks all files under that folder)
   - **Tag rules**: prefix-match on tags (e.g., `#secret` blocks files with that tag, including nested tags like `#secret/nested`). Tags are read from both inline tags and frontmatter.
3. **`McpSettingTab`** (`src/settings.ts`) — Settings UI for port, auth token, blacklist rules, and tool usage statistics display.
4. **`McpHttpServer`** (`src/server.ts`) — Express server with Streamable HTTP transport, session management, and timing-safe auth.
5. **`StatsTracker`** (`src/stats.ts`) — Tool usage statistics with debounced persistence. Wraps tool handlers via `track()` to auto-record total/success/fail counts.
6. **Tools** (`src/tools/`) — Each tool in its own file, registered via `src/tools/index.ts`.

### Data Persistence

Settings and stats are persisted together as `{ settings, toolStats }` via Obsidian's `loadData()`/`saveData()`. Backward-compatible: detects old flat-settings format and migrates automatically.

### Session Tracking

Active sessions are tracked in-memory via the `ActiveSession` interface in `src/server.ts`. Each session stores `connectedAt`, `clientName`, `clientVersion`, and per-session `toolStats`. Client name is extracted from the MCP `initialize` request's `clientInfo.name` field, with an optional `X-Client-Name` header override. Session data is not persisted — it exists only while sessions are active. The settings UI shows an "Active Sessions" table, and the `list_sessions` MCP tool exposes session info programmatically.

### Server Stack

- **Express** HTTP server on configurable port (default: `27123`)
- **Streamable HTTP transport** (`/mcp` endpoint) for MCP protocol communication
- **Bearer token auth** middleware on all routes (token auto-generated on first load, passed via `Authorization` header or `?token=` query param)
- **`@modelcontextprotocol/sdk`** for MCP server implementation

### MCP Tools Registered

| Tool | Purpose |
|------|---------|
| `get_active_file` | Returns content + metadata of the currently open note |
| `read_note` | Reads a specific note by vault-relative path |
| `append_daily_note` | Appends text to today's daily note (uses `obsidian-daily-notes-interface`) |
| `list_folder` | Lists files/folders in a directory |
| `list_all_tags` | Lists all tags in the vault with counts |
| `search_notes` | Filters notes by date range and/or tags (max 100 results) |
| `describe_vault` | Vault overview: name, file/folder counts, total size, file type breakdown, tag count |
| `create_note` | Create note at path with content. Prevents overwrite. Max 100K chars |
| `edit_note` | Replace entire content of existing note. Max 100K chars |
| `delete_note` | Delete note by path |
| `get_note_metadata` | Get frontmatter, tags, headings, links without full content |
| `list_recent_notes` | N most recently modified .md files, sorted newest-first (default 10, max 50) |
| `search_content` | Case-insensitive full-text search with line-number snippets. Max 50 results |
| `list_sessions` | List active sessions with client info and per-session tool stats |

All tools enforce security rules before returning data. All tools have usage statistics tracked via `StatsTracker`.

### Key Dependencies

- `@modelcontextprotocol/sdk` — MCP protocol implementation
- `obsidian-daily-notes-interface` — Integration with Obsidian's Daily Notes feature
- `zod` — Schema validation for MCP tool parameters
- `moment` — Used via `window.moment` (provided by Obsidian runtime, not bundled)

## Build System

esbuild configured in `esbuild.config.mjs`:
- Entry: `src/main.ts` → Output: `main.js` (CJS format, ES2018 target)
- `obsidian`, `electron`, and Node builtins are externalized (provided by the Obsidian runtime)
- `platform: "node"` is set for Express compatibility

## Testing

- Jest with `ts-jest` preset, node environment
- Tests in `tests/**/*.test.ts`
- Obsidian module is mocked via `tests/__mocks__/obsidian.ts` (stubs for `Plugin`, `Notice`, `TFile`, `TFolder`, `CachedMetadata`)
- Run a single test: `npx jest tests/main.test.ts`

## Dogfooding

When the plugin is running inside Obsidian, you can test it directly via curl to exercise the real MCP server. This is the best way to catch integration bugs that unit tests miss (e.g., the `StatsTracker.track()` argument-dropping bug was discovered this way).

**Setup**: Get the port and auth token from Obsidian's plugin settings (default port `27123`).

**1. Initialize a session**:
```bash
curl -s http://127.0.0.1:27123/mcp \
  -H "Authorization: Bearer <AUTH_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"test","version":"0.1.0"}}}'
```
Save the `mcp-session-id` response header for subsequent requests.

**2. Send initialized notification** (required before calling tools):
```bash
curl -s http://127.0.0.1:27123/mcp \
  -H "Authorization: Bearer <AUTH_TOKEN>" \
  -H "Content-Type: application/json" \
  -H "mcp-session-id: <SESSION_ID>" \
  -d '{"jsonrpc":"2.0","method":"notifications/initialized"}'
```

**3. Call tools**:
```bash
curl -s http://127.0.0.1:27123/mcp \
  -H "Authorization: Bearer <AUTH_TOKEN>" \
  -H "Content-Type: application/json" \
  -H "mcp-session-id: <SESSION_ID>" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"describe_vault","arguments":{}}}'
```

**4. List available tools**:
```bash
curl -s http://127.0.0.1:27123/mcp \
  -H "Authorization: Bearer <AUTH_TOKEN>" \
  -H "Content-Type: application/json" \
  -H "mcp-session-id: <SESSION_ID>" \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/list","params":{}}'
```

**What to verify**: Test both parameterless tools (`describe_vault`, `get_active_file`) and parameterized tools (`read_note`, `list_folder`) to ensure argument forwarding works end-to-end.

## Key Conventions

- The plugin uses `window.moment` (Obsidian's built-in moment.js) rather than importing it
- Auth token is a 16-byte hex string generated via Node's `crypto.randomBytes`
- Settings + stats are persisted via Obsidian's `loadData()`/`saveData()` in `{ settings, toolStats }` format
- Security rules reload automatically when settings are saved
- Each tool file exports a `register*` function taking `(mcp, plugin, tracker)`
- Stats are tracked via `StatsTracker.track()` wrapper — no manual recording needed in tool handlers
