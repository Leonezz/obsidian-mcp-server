import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

type LogLevel = 'debug' | 'info' | 'warning' | 'error';

export class McpLogger {
    constructor(
        private mcp: McpServer,
        private loggerName: string,
    ) {}

    debug(message: string, data?: Record<string, unknown>): void {
        this.log('debug', message, data);
    }

    info(message: string, data?: Record<string, unknown>): void {
        this.log('info', message, data);
    }

    warning(message: string, data?: Record<string, unknown>): void {
        this.log('warning', message, data);
    }

    error(message: string, data?: Record<string, unknown>): void {
        this.log('error', message, data);
    }

    private log(level: LogLevel, message: string, data?: Record<string, unknown>): void {
        this.mcp.sendLoggingMessage({
            level,
            logger: this.loggerName,
            data: data ? { message, ...data } : message,
        }).catch(() => { /* transport may be closed */ });
    }
}
