# Disable Auth Option — Design

## Goal

Add a toggle to disable Bearer token authentication on the MCP server, for easier local development and trusted environments.

## Approach

Boolean setting (`requireAuth`, default `true`) with middleware bypass. Simple, no over-engineering.

## Changes

### 1. Settings Type (`src/types.ts`)

Add `requireAuth: boolean` to `McpPluginSettings`, default `true`.

### 2. Auth Middleware (`src/server.ts`)

In `createAuthMiddleware()`, check `this.plugin.settings.requireAuth` first. If `false`, call `next()` immediately — skip all token extraction and validation.

### 3. Settings UI (`src/settings.ts`)

- Add "Require Authentication" toggle before the Auth Token field
- Description: "Require Bearer token for all connections. Disable for easier local development."
- On toggle off: show Obsidian confirmation dialog ("Disabling auth allows any local process to access your vault via the MCP server. Continue?"). Only save + restart if user confirms. Revert toggle if cancelled.
- When `requireAuth` is `false`, hide Auth Token display and Regenerate Token button
- Server restarts on change (both enable and disable)

### 4. Tests

- Auth middleware bypass when `requireAuth` is `false`
- Middleware still enforces auth when `requireAuth` is `true`

## What Stays the Same

- Token is still generated and stored (preserved for re-enabling auth)
- All other security (blacklist, path rules, tag rules) unchanged
- Token auto-generation on first load unchanged
- Server restart behavior unchanged

## User Answers

- **Use case**: Both local dev/testing and trusted local network convenience
- **Safety UX**: Toggle with confirmation dialog when disabling
- **UI behavior**: Hide token UI when auth is disabled
