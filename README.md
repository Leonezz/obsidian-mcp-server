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
*   **Usage Statistics:** Track tool call counts (total/successful/failed) in Settings, with persistent storage.
*   **Secure:** Uses a local **Auth Token** with timing-safe comparison to prevent unauthorized access.
*   **Access Control:** Blacklist paths and tags to keep sensitive notes private.

## Architecture

*   **Transport:** Streamable HTTP.
*   **Endpoint:** `http://localhost:<PORT>/mcp`
*   **Security:** Bearer Token Authentication required.

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

All tools enforce access control rules before returning data.

## Installation

### Method 1: BRAT (Beta)
1.  Install **BRAT** from Community Plugins.
2.  Add Beta Plugin: `zhuwenq/obsidian-mcp-server`
3.  Enable "Obsidian MCP Server".

## Configuration
1.  Go to **Settings -> Obsidian MCP Server**.
2.  Note your **Server Port** (Default: `27123`).
3.  Copy your **Auth Token**.
4.  Optionally configure **Access Control** blacklist rules for paths and tags.

## Usage with MCP Clients

The server uses **Streamable HTTP** transport on `http://localhost:<PORT>/mcp`. Configure your MCP client with:

- **URL:** `http://localhost:27123/mcp`
- **Auth:** Bearer token (from plugin settings)

Example configuration for clients that support Streamable HTTP:

```json
{
  "mcpServers": {
    "obsidian": {
      "url": "http://localhost:27123/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_TOKEN"
      }
    }
  }
}
```

---

## 🤖 Instructions for AI Agents

If you are an AI Agent trying to install this MCP server for a user, follow these steps:

1.  **Verify Installation:** Check if the user has Obsidian installed and the plugin `obsidian-mcp-server` is active.
2.  **Retrieve Credentials:** Ask the user for two things:
    *   The **Auth Token** (from Obsidian Settings).
    *   The **Server Port** (Default is `27123`, but check if they changed it).
3.  **Configure Client:**
    *   Locate the MCP Client configuration file.
    *   Insert the following server definition (replacing placeholders):

```json
"obsidian": {
  "url": "http://localhost:<USER_PORT>/mcp",
  "headers": {
    "Authorization": "Bearer <USER_TOKEN>"
  }
}
```

4.  **Restart Client:** Tell the user to restart their MCP Client.
