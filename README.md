# Obsidian MCP Server

**Give your AI Agents a seat at the table.**

This plugin runs a local **Model Context Protocol (MCP)** server inside Obsidian. It allows external AI tools (like Claude Desktop, Cursor, or CLI agents) to connect to Obsidian, read your active context, and perform actions directly within the app.

> ⚠️ **Status:** Beta (Production Ready Logic).

## Features

*   **Context Awareness:** `get_active_file` lets the agent see exactly what you are working on.
*   **Vault Access:** `read_note`, `get_note_metadata`, and `describe_vault` provide full vault visibility.
*   **Note Management:** `create_note`, `edit_note`, and `delete_note` allow agents to manage your notes.
*   **Search:** `search_notes` filters by date/tags; `search_content` does full-text search with line-number snippets.
*   **Quick Capture:** `append_daily_note` works with your Daily Notes settings (creates/appends correctly).
*   **Discovery:** `list_folder`, `list_all_tags`, and `list_recent_notes` help agents explore the vault.
*   **Session Tracking:** `list_sessions` shows active connections with client name/version and per-session tool usage stats.
*   **Usage Statistics:** Track tool call counts (total/successful/failed) in Settings, with persistent storage.
*   **Secure:** Uses a local **Auth Token** with timing-safe comparison. Authentication can be disabled for local development.
*   **Access Control:** Blacklist paths and tags to keep sensitive notes private.

## Architecture

*   **Transport:** Streamable HTTP.
*   **Endpoint:** `http://localhost:<PORT>/mcp`
*   **Security:** Bearer Token Authentication (enabled by default, can be disabled in settings).

## Available Tools

| Tool | Description |
|------|-------------|
| `get_active_file` | Returns content + metadata of the currently open note |
| `read_note` | Reads a specific note by vault-relative path |
| `append_daily_note` | Appends text to today's daily note |
| `list_folder` | Lists files/folders in a directory |
| `list_all_tags` | Lists all tags in the vault with usage counts |
| `search_notes` | Filters notes by date range and/or tags (max 100 results) |
| `describe_vault` | Vault overview: name, file/folder counts, total size, file type breakdown, tag count |
| `create_note` | Create a new note at a given path (prevents overwriting) |
| `edit_note` | Replace entire content of an existing note |
| `delete_note` | Delete a note by path |
| `get_note_metadata` | Get frontmatter, tags, headings, links without full content |
| `list_recent_notes` | Most recently modified notes, sorted newest-first (default 10, max 50) |
| `search_content` | Case-insensitive full-text search with line-number snippets (max 50 results) |
| `list_sessions` | List active sessions with client info and per-session tool usage stats |

All tools enforce access control rules before returning data.

## Installation

### Method 1: BRAT (Beta)
1.  Install **BRAT** from Community Plugins.
2.  Add Beta Plugin: `zhuwenq/obsidian-mcp-server`
3.  Enable "Obsidian MCP Server".

## Configuration
1.  Go to **Settings -> Obsidian MCP Server**.
2.  Note your **Server Port** (Default: `27123`).
3.  Copy your **Auth Token** (or disable "Require Authentication" for local development).
4.  Optionally configure **Access Control** blacklist rules for paths and tags.

## Usage with MCP Clients

The server uses **Streamable HTTP** transport on `http://localhost:<PORT>/mcp`.

> **Tip:** If you disabled "Require Authentication" in settings, omit the `Authorization` header / `headers` block from all configurations below.

### Claude Code

Claude Code natively supports Streamable HTTP. Add the server via CLI:

```bash
claude mcp add --transport http obsidian http://localhost:27123/mcp \
  --header "Authorization: Bearer YOUR_TOKEN"
```

Or add it to your project's `.mcp.json`:

```json
{
  "mcpServers": {
    "obsidian": {
      "type": "http",
      "url": "http://localhost:27123/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_TOKEN"
      }
    }
  }
}
```

### Cursor

Add to `~/.cursor/mcp.json` (global) or `.cursor/mcp.json` (workspace):

```json
{
  "mcpServers": {
    "obsidian": {
      "type": "streamable-http",
      "url": "http://localhost:27123/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_TOKEN"
      }
    }
  }
}
```

### Windsurf

Add to `~/.codeium/windsurf/mcp_config.json`:

```json
{
  "mcpServers": {
    "obsidian": {
      "serverUrl": "http://localhost:27123/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_TOKEN"
      }
    }
  }
}
```

> **Note:** Windsurf uses `"serverUrl"` instead of `"url"`.

### Claude Desktop

Claude Desktop does not natively support Streamable HTTP in its config file. Use the `mcp-remote` proxy:

Add to `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "obsidian": {
      "command": "npx",
      "args": [
        "mcp-remote",
        "http://localhost:27123/mcp",
        "--header",
        "Authorization: Bearer YOUR_TOKEN"
      ]
    }
  }
}
```

### Other Clients

Any MCP client that supports Streamable HTTP can connect using:

- **URL:** `http://localhost:27123/mcp`
- **Header:** `Authorization: Bearer YOUR_TOKEN`

---

## Instructions for AI Agents

If you are an AI Agent helping a user connect to this MCP server:

1.  **Verify Installation:** Check that the user has Obsidian running with the `obsidian-mcp-server` plugin enabled.
2.  **Retrieve Connection Info:** Ask the user for:
    *   The **Server Port** (default `27123`).
    *   The **Auth Token** (from Obsidian Settings), unless they have disabled authentication.
3.  **Detect Client:** Determine which MCP client the user is running (Claude Code, Cursor, Windsurf, Claude Desktop, etc.) and use the matching configuration format from the sections above.
4.  **Configure & Restart:** Insert the server definition into the appropriate config file and tell the user to restart their MCP client.
