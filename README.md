# Obsidian MCP Server

**Give your AI Agents a seat at the table.**

This plugin runs a local **Model Context Protocol (MCP)** server inside Obsidian. It allows external AI tools (like Claude Desktop, Cursor, or CLI agents) to connect to Obsidian, read your active context, and perform actions directly within the app.

> ⚠️ **Status:** Beta (Production Ready Logic).

## Features

*   **Context Awareness:** `get_active_file` lets the agent see exactly what you are working on.
*   **Vault Access:** `read_note` allows retrieving specific notes by path.
*   **Quick Capture:** `append_daily_note` works with your Daily Notes settings (creates/appends correctly).
*   **Secure:** Uses a local **Auth Token** to prevent unauthorized access.

## Architecture

*   **Transport:** SSE (Server-Sent Events).
*   **Endpoint:** `http://localhost:<PORT>/sse`
*   **Security:** Bearer Token Authentication required.

## Installation

### Method 1: BRAT (Beta)
1.  Install **BRAT** from Community Plugins.
2.  Add Beta Plugin: `zhuwenq/obsidian-mcp-server`
3.  Enable "Obsidian MCP Server".

## Configuration
1.  Go to **Settings -> Obsidian MCP Server**.
2.  Note your **Server Port** (Default: `27123`).
3.  Copy your **Auth Token**.

## Usage with Claude Desktop

Add this to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "obsidian": {
      "url": "http://localhost:27123/sse?token=YOUR_TOKEN",
      "transport": "sse"
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
  "url": "http://localhost:<USER_PORT>/sse?token=<USER_TOKEN>",
  "transport": "sse"
}
```

4.  **Restart Client:** Tell the user to restart their MCP Client.
