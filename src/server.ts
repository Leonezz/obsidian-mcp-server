import crypto from 'crypto';
import http from 'http';
import express, { Request, Response, NextFunction } from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { Notice } from 'obsidian';
import type McpPlugin from './main';
import { registerTools } from './tools';

interface ActiveSession {
    transport: StreamableHTTPServerTransport;
    mcp: McpServer;
}

export class McpHttpServer {
    private httpServer: http.Server | null = null;
    private sessions = new Map<string, ActiveSession>();

    constructor(private plugin: McpPlugin) {}

    stop(): void {
        for (const [, session] of this.sessions) {
            session.transport.close().catch(() => {});
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
                this.handleMcpRequest(req, res).catch(err => {
                    console.error('MCP request error:', err);
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

            const port = this.plugin.settings.port;
            this.httpServer = app.listen(port, '127.0.0.1', () => {
                new Notice(`MCP Server Online (Port ${port})`);
            });

            this.httpServer.on('error', (err: NodeJS.ErrnoException) => {
                if (err.code === 'EADDRINUSE') {
                    new Notice(`MCP Error: Port ${port} busy`);
                } else {
                    console.error('MCP Server Error:', err);
                }
            });
        } catch (e) {
            console.error('Failed to start MCP Server:', e);
            new Notice('MCP Server Failed to Start');
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

    private async handleMcpRequest(req: Request, res: Response): Promise<void> {
        if (req.method === 'GET') {
            const sessionId = req.headers['mcp-session-id'] as string | undefined;
            if (sessionId && this.sessions.has(sessionId)) {
                const session = this.sessions.get(sessionId)!;
                await session.transport.handleRequest(req, res, req.body);
                return;
            }
            res.status(400).json({ error: 'Invalid or missing session.' });
            return;
        }

        if (req.method === 'DELETE') {
            const sessionId = req.headers['mcp-session-id'] as string | undefined;
            if (sessionId && this.sessions.has(sessionId)) {
                const session = this.sessions.get(sessionId)!;
                await session.transport.close();
                this.sessions.delete(sessionId);
                res.status(200).json({ status: 'session terminated' });
                return;
            }
            res.status(404).json({ error: 'Session not found.' });
            return;
        }

        if (req.method !== 'POST') {
            res.status(405).json({ error: 'Method not allowed.' });
            return;
        }

        const sessionId = req.headers['mcp-session-id'] as string | undefined;

        if (sessionId && this.sessions.has(sessionId)) {
            const session = this.sessions.get(sessionId)!;
            await session.transport.handleRequest(req, res, req.body);
            return;
        }

        if (!isInitializeRequest(req.body)) {
            res.status(400).json({ error: 'Bad request: expected initialization or valid session ID.' });
            return;
        }

        const transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => crypto.randomUUID(),
        });

        const mcp = new McpServer({
            name: 'Obsidian MCP',
            version: '1.0.0',
        });

        registerTools(mcp, this.plugin);
        await mcp.connect(transport);

        if (transport.sessionId) {
            this.sessions.set(transport.sessionId, { transport, mcp });
            transport.onclose = () => {
                if (transport.sessionId) {
                    this.sessions.delete(transport.sessionId);
                }
            };
        }

        await transport.handleRequest(req, res, req.body);
    }
}
