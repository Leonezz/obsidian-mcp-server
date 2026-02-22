import * as crypto from 'crypto';
import * as http from 'http';
import express, { Request, Response, NextFunction } from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { Notice } from 'obsidian';
import type McpPlugin from './main';
import { registerTools } from './tools';
import { buildInstructions } from './instructions';
import { McpLogger } from './logging';
import { registerPrompts } from './prompts';
import { registerResources } from './resources';
import type { ResourceSubscriptionManager } from './resources/subscriptions';
import type { ToolUsageStats, SessionSummary } from './types';
import { recordToolCall, recordToolSuccess, recordToolFailure } from './stats';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const PKG_VERSION: string = require('../package.json').version;

const MAX_CLIENT_STRING_LENGTH = 128;
const SESSION_TTL_MS = 30 * 60 * 1000; // 30 minutes
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_SESSIONS = 10;

interface ActiveSession {
    transport: StreamableHTTPServerTransport;
    mcp: McpServer;
    lastAccess: number;
    connectedAt: number;
    clientName: string;
    clientVersion: string;
    toolStats: ToolUsageStats;
}

export class McpHttpServer {
    private httpServer: http.Server | null = null;
    private sessions = new Map<string, ActiveSession>();
    private cleanupInterval: ReturnType<typeof setInterval> | null = null;
    private subscriptionManager: ResourceSubscriptionManager | null = null;

    constructor(private plugin: McpPlugin) {}

    setSubscriptionManager(manager: ResourceSubscriptionManager): void {
        this.subscriptionManager = manager;
    }

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
                    byTool: { ...session.toolStats },
                },
            });
        }
        return summaries;
    }

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

    stop(): void {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
        }

        for (const [, session] of this.sessions) {
            session.transport.close().catch(() => { /* intentionally ignored */ });
        }
        this.sessions.clear();

        if (this.httpServer) {
            this.httpServer.close();
            this.httpServer = null;
        }
    }

    start(): void {
        this.stop();

        try {
            const app = express();
            app.use(express.json());
            app.use(this.createAuthMiddleware());

            app.all('/mcp', (req: Request, res: Response) => {
                this.handleMcpRequest(req, res).catch(() => {
                    if (!res.headersSent) {
                        res.status(500).json({ error: 'Internal server error.' });
                    }
                });
            });

            app.get('/sse', (_req: Request, res: Response) => {
                res.status(410).json({
                    error: 'The /sse endpoint is deprecated. Use /mcp with Streamable HTTP transport.',
                });
            });

            this.startSessionCleanup();

            const port = this.plugin.settings.port;
            this.httpServer = app.listen(port, '127.0.0.1', () => {
                new Notice(`MCP Server Online (Port ${port})`);
            });

            this.httpServer.on('error', (err: NodeJS.ErrnoException) => {
                if (err.code === 'EADDRINUSE') {
                    new Notice(`MCP Error: Port ${port} busy`);
                } else {
                    new Notice(`MCP Server Error: ${err.message}`);
                }
            });
        } catch {
            new Notice('MCP Server Failed to Start');
        }
    }

    private startSessionCleanup(): void {
        this.cleanupInterval = setInterval(() => {
            const now = Date.now();
            for (const [id, session] of this.sessions) {
                if (now - session.lastAccess > SESSION_TTL_MS) {
                    session.transport.close().catch(() => { /* intentionally ignored */ });
                    this.sessions.delete(id);
                }
            }
        }, CLEANUP_INTERVAL_MS);
    }

    private evictOldestSession(): void {
        let oldestId: string | null = null;
        let oldestTime = Infinity;
        for (const [id, session] of this.sessions) {
            if (session.lastAccess < oldestTime) {
                oldestTime = session.lastAccess;
                oldestId = id;
            }
        }
        if (oldestId) {
            const session = this.sessions.get(oldestId)!;
            session.transport.close().catch(() => { /* intentionally ignored */ });
            this.sessions.delete(oldestId);
        }
    }

    private createAuthMiddleware(): (req: Request, res: Response, next: NextFunction) => void {
        return (req: Request, res: Response, next: NextFunction) => {
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

    private hasInitializeRequest(body: unknown): boolean {
        if (Array.isArray(body)) {
            return body.some(msg => isInitializeRequest(msg));
        }
        return isInitializeRequest(body);
    }

    private async handleMcpRequest(req: Request, res: Response): Promise<void> {
        const sessionId = req.headers['mcp-session-id'] as string | undefined;

        // Route GET/DELETE to existing sessions
        if (req.method === 'GET' || req.method === 'DELETE') {
            if (sessionId && this.sessions.has(sessionId)) {
                const session = this.sessions.get(sessionId)!;
                session.lastAccess = Date.now();
                await session.transport.handleRequest(req, res, req.body);
                return;
            }
            const status = req.method === 'GET' ? 400 : 404;
            const error = req.method === 'GET'
                ? 'Invalid or missing session.'
                : 'Session not found.';
            res.status(status).json({ error });
            return;
        }

        if (req.method !== 'POST') {
            res.status(405).json({ error: 'Method not allowed.' });
            return;
        }

        // Route POST to existing session
        if (sessionId && this.sessions.has(sessionId)) {
            const session = this.sessions.get(sessionId)!;
            session.lastAccess = Date.now();
            await session.transport.handleRequest(req, res, req.body);
            return;
        }

        const isInitRequest = this.hasInitializeRequest(req.body);

        // Stale session ID: provided but no longer exists (expired/evicted/server restarted)
        if (sessionId && !isInitRequest) {
            res.status(404).json({
                error: 'Session not found — it may have expired or the server may have restarted. '
                    + 'To recover, send a new "initialize" request (method: "initialize") without '
                    + 'the mcp-session-id header to create a fresh session, then use the returned '
                    + 'mcp-session-id for subsequent requests.',
                code: 'SESSION_EXPIRED',
            });
            return;
        }

        // No session and not an initialize request
        if (!isInitRequest) {
            res.status(400).json({
                error: 'Missing session. The MCP protocol requires a session before calling tools. '
                    + 'Send a POST to /mcp with method "initialize" (no mcp-session-id header) first, '
                    + 'then include the mcp-session-id from the response header in all subsequent requests.',
                code: 'INITIALIZATION_REQUIRED',
            });
            return;
        }

        // Evict oldest session if at capacity
        if (this.sessions.size >= MAX_SESSIONS) {
            this.evictOldestSession();
        }

        // Extract client info from initialize request
        const clientNameHeader = req.headers['x-client-name'] as string | undefined;
        const initBody = Array.isArray(req.body)
            ? req.body.find((msg: Record<string, unknown>) => isInitializeRequest(msg))
            : req.body;
        const clientInfo = (initBody?.params as Record<string, unknown>)?.clientInfo as
            { name?: string; version?: string } | undefined;
        const rawName = clientNameHeader || clientInfo?.name || 'Unknown';
        const rawVersion = clientInfo?.version || '';
        const clientName = typeof rawName === 'string' ? rawName.slice(0, MAX_CLIENT_STRING_LENGTH) : 'Unknown';
        const clientVersion = typeof rawVersion === 'string' ? rawVersion.slice(0, MAX_CLIENT_STRING_LENGTH) : '';

        const transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => crypto.randomUUID(),
            onsessioninitialized: (id: string) => {
                const now = Date.now();
                this.sessions.set(id, {
                    transport,
                    mcp,
                    lastAccess: now,
                    connectedAt: now,
                    clientName,
                    clientVersion,
                    toolStats: {},
                });
            },
        });

        const instructions = buildInstructions(this.plugin);
        const mcp = new McpServer({
            name: 'Obsidian MCP',
            version: PKG_VERSION,
        }, instructions ? { instructions } : undefined);

        const logger = new McpLogger(mcp, 'obsidian-mcp');
        registerTools(mcp, this.plugin, logger);
        registerPrompts(mcp, this.plugin);
        registerResources(mcp, this.plugin);

        if (this.subscriptionManager) {
            this.subscriptionManager.registerSession(mcp);
        }

        transport.onclose = () => {
            if (transport.sessionId) {
                this.sessions.delete(transport.sessionId);
            }
            if (this.subscriptionManager) {
                this.subscriptionManager.unregisterSession(mcp);
            }
        };

        await mcp.connect(transport);
        await transport.handleRequest(req, res, req.body);
    }
}
