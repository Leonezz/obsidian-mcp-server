import type { ToolCallStats, ToolUsageStats } from './types';
import { STATS_SAVE_DEBOUNCE_MS } from './tools/constants';

const EMPTY_STATS: ToolCallStats = { total: 0, successful: 0, failed: 0 };

export function recordToolCall(stats: ToolUsageStats, toolName: string): ToolUsageStats {
    const prev = stats[toolName] ?? EMPTY_STATS;
    return { ...stats, [toolName]: { ...prev, total: prev.total + 1 } };
}

export function recordToolSuccess(stats: ToolUsageStats, toolName: string): ToolUsageStats {
    const prev = stats[toolName] ?? EMPTY_STATS;
    return { ...stats, [toolName]: { ...prev, successful: prev.successful + 1 } };
}

export function recordToolFailure(stats: ToolUsageStats, toolName: string): ToolUsageStats {
    const prev = stats[toolName] ?? EMPTY_STATS;
    return { ...stats, [toolName]: { ...prev, failed: prev.failed + 1 } };
}

export class StatsTracker {
    private dirty = false;
    private debounceTimer: ReturnType<typeof setTimeout> | null = null;

    private onToolResult: ((sessionId: string, toolName: string, success: boolean) => void) | null = null;

    constructor(
        private getStats: () => ToolUsageStats,
        private setStats: (stats: ToolUsageStats) => void,
        private persist: () => Promise<void>,
    ) {}

    setOnToolResult(callback: (sessionId: string, toolName: string, success: boolean) => void): void {
        this.onToolResult = callback;
    }

    track<T, A extends unknown[]>(toolName: string, handler: (...args: A) => Promise<T>): (...args: A) => Promise<T> {
        return async (...args: A) => {
            this.setStats(recordToolCall(this.getStats(), toolName));
            const extra = args[1] as { sessionId?: string } | undefined;
            const sessionId = extra?.sessionId;
            try {
                const result = await handler(...args);
                this.setStats(recordToolSuccess(this.getStats(), toolName));
                this.scheduleSave();
                if (sessionId) this.onToolResult?.(sessionId, toolName, true);
                return result;
            } catch (err) {
                this.setStats(recordToolFailure(this.getStats(), toolName));
                this.scheduleSave();
                if (sessionId) this.onToolResult?.(sessionId, toolName, false);
                throw err;
            }
        };
    }

    private scheduleSave(): void {
        this.dirty = true;
        if (this.debounceTimer) return;
        this.debounceTimer = setTimeout(async () => {
            this.debounceTimer = null;
            if (this.dirty) {
                this.dirty = false;
                await this.persist();
            }
        }, STATS_SAVE_DEBOUNCE_MS);
    }

    async flush(): Promise<void> {
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
            this.debounceTimer = null;
        }
        if (this.dirty) {
            this.dirty = false;
            await this.persist();
        }
    }
}
