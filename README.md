# Obsidian MCP Server

**Give your AI Agents a seat at the table.**

This plugin runs a local **Model Context Protocol (MCP)** server inside Obsidian. It allows external AI tools (like Claude Desktop, Cursor, or CLI agents) to connect to Obsidian, read your active context, and perform actions directly within the app.

> ⚠️ **Status:** Beta (Production Ready Logic).

## Features

*   **Context Awareness:** `get_active_file` lets the agent see exactly what you are working on.
*   **Vault Access:** `read_note`, `get_note_metadata`, `get_backlinks`, and `describe_vault` provide full vault visibility.
*   **Note Management:** `create_note`, `edit_note`, `append_note`, `patch_note`, `rename_note`, and `delete_note` allow agents to manage your notes.
*   **Attachment Handling:** `read_attachment` returns images as MCP ImageContent (AI can see them); `add_attachment` saves binary files to the vault.
*   **Search:** `search_notes` filters by date/tags/frontmatter; `search_content` does full-text or regex search with line-number snippets and optional metadata.
*   **Quick Capture:** `append_daily_note` works with your Daily Notes settings (creates/appends correctly).
*   **Discovery:** `list_folder` (with sorting, filtering, recursion), `list_all_tags`, `list_recent_notes`, and `create_folder` help agents explore and organize the vault.
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
| `get_active_file` | Get the content and metadata of the currently active note |
| `read_note` | Read a note by vault-relative path |
| `create_note` | Create a new note at a given path (auto-creates parent folders, prevents overwriting) |
| `edit_note` | Replace entire content of an existing note |
| `append_note` | Append or prepend text to an existing note |
| `patch_note` | Find-and-replace edit on a note (no full rewrite needed) |
| `rename_note` | Rename or move a note (Obsidian auto-updates wikilinks) |
| `delete_note` | Delete a note by path |
| `read_attachment` | Read a binary attachment — images returned as ImageContent (AI can see them) |
| `add_attachment` | Save a base64-encoded file to the vault (respects Obsidian's attachment folder setting) |
| `get_note_metadata` | Get frontmatter, tags, headings, links without full content |
| `get_backlinks` | Get incoming links (backlinks) to a note |
| `list_folder` | List files/folders with sorting, file type filtering, and recursive listing |
| `list_all_tags` | List all hashtags in the vault with usage counts |
| `list_recent_notes` | Most recently modified notes, sorted newest-first (default 10, max 50) |
| `create_folder` | Create a folder (with intermediate parents, like `mkdir -p`) |
| `search_notes` | Filter notes by date range, tags, and/or frontmatter fields |
| `search_content` | Full-text or regex search with line-number snippets, optional folder scope and metadata |
| `describe_vault` | Vault overview: name, file/folder counts, total size, file type breakdown, tag count |
| `append_daily_note` | Append text to today's daily note |
| `list_sessions` | List active MCP sessions with client info and per-session tool stats |

All tools enforce access control rules before returning data.

## Installation

### Method 1: BRAT (Beta)
1.  Install **BRAT** from Community Plugins.
2.  Add Beta Plugin: `Leonezz/obsidian-mcp-server`
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

### OpenClaw

OpenClaw does not yet support MCP natively. Use the bundled **OpenClaw skill** instead, which teaches the agent to communicate with the server via `curl` and `jq`.

**Install the skill:**

```bash
cp -r openclaw-skill/ ~/.openclaw/workspace/skills/obsidian-mcp/
```

**Set the auth token:**

```bash
export OBSIDIAN_MCP_TOKEN="YOUR_TOKEN"
```

Optionally set `OBSIDIAN_MCP_PORT` (default `27123`) and `OBSIDIAN_MCP_HOST` (default `127.0.0.1`).

Once installed, OpenClaw will automatically discover the skill and can read, search, create, and edit notes in your vault.

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
