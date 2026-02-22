# Disable Auth Option Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a toggle to disable Bearer token authentication on the MCP server for local development and trusted environments.

**Architecture:** Add `requireAuth` boolean to settings (default `true`). Auth middleware checks this flag first — if `false`, skips all token validation. Settings UI shows a toggle with confirmation dialog, and hides token-related UI when auth is off.

**Tech Stack:** TypeScript, Obsidian Plugin API, Express middleware, Jest

---

### Task 1: Add `requireAuth` setting to types

**Files:**
- Modify: `src/types.ts:2-4` (add field to interface)
- Modify: `src/types.ts:23-25` (add default value)
- Test: `tests/main.test.ts`

**Step 1: Add `requireAuth` to `McpPluginSettings` interface**

In `src/types.ts`, add `requireAuth: boolean;` after `authToken: string;`:

```typescript
export interface McpPluginSettings {
    port: number;
    authToken: string;
    requireAuth: boolean;
    blacklist: string;
    // ... rest unchanged
}
```

**Step 2: Add default value**

In `DEFAULT_SETTINGS`, add `requireAuth: true,` after `authToken: ''`:

```typescript
export const DEFAULT_SETTINGS: McpPluginSettings = {
    port: 27123,
    authToken: '',
    requireAuth: true,
    blacklist: 'Secret/\n#secret',
    // ... rest unchanged
};
```

**Step 3: Run tests to verify nothing breaks**

Run: `npx jest --verbose`
Expected: All existing tests PASS (the new default merges cleanly with existing saved data).

**Step 4: Commit**

```bash
git add src/types.ts
git commit -m "feat: add requireAuth setting to McpPluginSettings"
```

---

### Task 2: Update auth middleware to respect `requireAuth`

**Files:**
- Modify: `src/server.ts:173-203` (auth middleware)
- Test: `tests/auth.test.ts` (create)

**Step 1: Write the failing tests**

Create `tests/auth.test.ts`:

```typescript
import * as crypto from 'crypto';

/**
 * Unit-test the auth middleware logic in isolation.
 * We extract the same branching logic from McpHttpServer.createAuthMiddleware()
 * and test it without Express or the full server.
 */

interface AuthCheckResult {
    allowed: boolean;
    status?: number;
    error?: string;
}

/** Pure function mirroring createAuthMiddleware logic */
function checkAuth(
    requireAuth: boolean,
    serverToken: string,
    authHeader: string | undefined,
    queryToken: string | undefined,
): AuthCheckResult {
    if (!requireAuth) {
        return { allowed: true };
    }

    if (!serverToken) {
        return { allowed: false, status: 500, error: 'Server misconfigured: no auth token.' };
    }

    let clientToken: string | undefined;
    if (authHeader?.startsWith('Bearer ')) {
        clientToken = authHeader.slice(7);
    } else if (typeof queryToken === 'string') {
        clientToken = queryToken;
    }

    if (!clientToken || clientToken.length === 0) {
        return { allowed: false, status: 403, error: 'Unauthorized.' };
    }

    const serverBuf = Buffer.from(serverToken);
    const clientBuf = Buffer.from(clientToken);
    if (serverBuf.length !== clientBuf.length || !crypto.timingSafeEqual(serverBuf, clientBuf)) {
        return { allowed: false, status: 403, error: 'Unauthorized.' };
    }

    return { allowed: true };
}

describe('auth middleware logic', () => {
    const TOKEN = 'abc123';

    test('requireAuth=false bypasses all validation', () => {
        const result = checkAuth(false, '', undefined, undefined);
        expect(result).toEqual({ allowed: true });
    });

    test('requireAuth=true with valid Bearer token allows request', () => {
        const result = checkAuth(true, TOKEN, `Bearer ${TOKEN}`, undefined);
        expect(result).toEqual({ allowed: true });
    });

    test('requireAuth=true with valid query token allows request', () => {
        const result = checkAuth(true, TOKEN, undefined, TOKEN);
        expect(result).toEqual({ allowed: true });
    });

    test('requireAuth=true with no token rejects with 403', () => {
        const result = checkAuth(true, TOKEN, undefined, undefined);
        expect(result).toEqual({ allowed: false, status: 403, error: 'Unauthorized.' });
    });

    test('requireAuth=true with wrong token rejects with 403', () => {
        const result = checkAuth(true, TOKEN, 'Bearer wrong', undefined);
        expect(result).toEqual({ allowed: false, status: 403, error: 'Unauthorized.' });
    });

    test('requireAuth=true with no server token rejects with 500', () => {
        const result = checkAuth(true, '', undefined, undefined);
        expect(result).toEqual({ allowed: false, status: 500, error: 'Server misconfigured: no auth token.' });
    });
});
```

**Step 2: Run tests to verify they pass** (these test a local pure function, so they should all pass immediately)

Run: `npx jest tests/auth.test.ts --verbose`
Expected: All 6 tests PASS.

**Step 3: Update auth middleware in `src/server.ts`**

Replace the `createAuthMiddleware` method body. Add the `requireAuth` check as the very first line:

```typescript
private createAuthMiddleware(): (req: Request, res: Response, next: NextFunction) => void {
    return (req: Request, res: Response, next: NextFunction) => {
        if (!this.plugin.settings.requireAuth) {
            next();
            return;
        }

        const serverToken = this.plugin.settings.authToken;
        if (!serverToken) {
            res.status(500).json({ error: 'Server misconfigured: no auth token.' });
            return;
        }

        let clientToken: string | undefined;
        const authHeader = req.headers.authorization;
        if (authHeader?.startsWith('Bearer ')) {
            clientToken = authHeader.slice(7);
        } else if (typeof req.query.token === 'string') {
            clientToken = req.query.token;
        }

        if (!clientToken || clientToken.length === 0) {
            res.status(403).json({ error: 'Unauthorized.' });
            return;
        }

        const serverBuf = Buffer.from(serverToken);
        const clientBuf = Buffer.from(clientToken);
        if (serverBuf.length !== clientBuf.length || !crypto.timingSafeEqual(serverBuf, clientBuf)) {
            res.status(403).json({ error: 'Unauthorized.' });
            return;
        }

        next();
    };
}
```

**Step 4: Run all tests**

Run: `npx jest --verbose`
Expected: All tests PASS.

**Step 5: Commit**

```bash
git add src/server.ts tests/auth.test.ts
git commit -m "feat: auth middleware respects requireAuth setting"
```

---

### Task 3: Update settings UI with auth toggle

**Files:**
- Modify: `src/settings.ts:19-59` (Server Section)

**Step 1: Add `addToggle` to the Obsidian mock**

In `tests/__mocks__/obsidian.ts`, the `Setting` class needs an `addToggle` method. Check if it exists — if not, add it:

```typescript
export class Setting {
    constructor(_el: any) {}
    setName(_name: string) { return this; }
    setDesc(_desc: string) { return this; }
    addText(_cb: any) { return this; }
    addTextArea(_cb: any) { return this; }
    addButton(_cb: any) { return this; }
    addExtraButton(_cb: any) { return this; }
    addToggle(_cb: any) { return this; }
}
```

**Step 2: Update settings UI**

In `src/settings.ts`, replace the Server Section (lines 19-59) with the following. Key changes:
1. Add "Require Authentication" toggle before auth token UI
2. Wrap Auth Token and Regenerate Token in a conditional on `requireAuth`
3. Toggle uses confirmation dialog via Obsidian's `Notice` pattern — but since Obsidian doesn't have a built-in confirm dialog, use `window.confirm()` which works in Electron.

```typescript
// --- Server Section ---
new Setting(containerEl)
    .setName('Server Port')
    .setDesc('Port to listen on (1024-65535). Default: 27123. Server restarts on change.')
    .addText(text => text
        .setValue(String(this.plugin.settings.port))
        .onChange(async (value) => {
            const port = parseInt(value, 10);
            if (isNaN(port) || port < 1024 || port > 65535) return;
            this.plugin.settings.port = port;
            await this.plugin.saveSettings();
            if (this.portRestartTimeout) clearTimeout(this.portRestartTimeout);
            this.portRestartTimeout = setTimeout(() => {
                this.plugin.restartServer();
            }, 1000);
        }));

new Setting(containerEl)
    .setName('Require Authentication')
    .setDesc('Require Bearer token for all connections. Disable for easier local development.')
    .addToggle(toggle => toggle
        .setValue(this.plugin.settings.requireAuth)
        .onChange(async (value) => {
            if (!value) {
                const confirmed = window.confirm(
                    'Disabling auth allows any local process to access your vault via the MCP server. Continue?'
                );
                if (!confirmed) {
                    toggle.setValue(true);
                    return;
                }
            }
            this.plugin.settings.requireAuth = value;
            await this.plugin.saveSettings();
            this.display();
            this.plugin.restartServer();
        }));

if (this.plugin.settings.requireAuth) {
    new Setting(containerEl)
        .setName('Auth Token')
        .setDesc('Required for connecting. Use the Authorization header: Bearer <token>')
        .addText(text => text
            .setValue(this.plugin.settings.authToken)
            .setDisabled(true))
        .addExtraButton(btn => btn
            .setIcon('copy')
            .onClick(() => {
                navigator.clipboard.writeText(this.plugin.settings.authToken);
                new Notice('Token copied');
            }));

    new Setting(containerEl)
        .setName('Regenerate Token')
        .addButton(btn => btn
            .setButtonText('Regenerate')
            .setWarning()
            .onClick(async () => {
                this.plugin.settings.authToken = crypto.randomBytes(16).toString('hex');
                await this.plugin.saveSettings();
                this.display();
                this.plugin.restartServer();
            }));
}
```

**Step 3: Run all tests**

Run: `npx jest --verbose`
Expected: All tests PASS.

**Step 4: Commit**

```bash
git add src/settings.ts tests/__mocks__/obsidian.ts
git commit -m "feat: add Require Authentication toggle to settings UI"
```

---

### Task 4: Update CLAUDE.md documentation

**Files:**
- Modify: `CLAUDE.md`

**Step 1: Update the dogfooding section**

In `CLAUDE.md`, in the dogfooding "1. Initialize a session" curl example, add a note that auth can be disabled:

After the setup line ("**Setup**: Get the port and auth token from Obsidian's plugin settings (default port `27123`)."), add:

> **Note**: If "Require Authentication" is disabled in settings, you can omit the `Authorization` header from all requests.

**Step 2: Update the Server Stack section**

In the Architecture → Server Stack section, update the Bearer token auth bullet to mention the toggle:

```
- **Bearer token auth** middleware on all routes (token auto-generated on first load, can be disabled via settings; passed via `Authorization` header or `?token=` query param)
```

**Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: document optional auth toggle in CLAUDE.md"
```

---

### Task 5: Add `requireAuth` to loadSettings backward compatibility test

**Files:**
- Test: `tests/main.test.ts`

**Step 1: Add test for old data missing `requireAuth`**

Add a test to `tests/main.test.ts` to verify that loading old saved data (without `requireAuth`) defaults to `true`:

```typescript
test('loadSettings defaults requireAuth to true for old data', async () => {
    (plugin as any).loadData = jest.fn().mockResolvedValue({
        settings: { port: 27123, authToken: 'tok', blacklist: '' },
        toolStats: {},
    });
    await plugin.loadSettings();
    expect(plugin.settings.requireAuth).toBe(true);
});
```

**Step 2: Run the test**

Run: `npx jest tests/main.test.ts --verbose`
Expected: PASS (the `...DEFAULT_SETTINGS, ...saved` merge fills in the missing field).

**Step 3: Commit**

```bash
git add tests/main.test.ts
git commit -m "test: verify requireAuth defaults for backward compatibility"
```
