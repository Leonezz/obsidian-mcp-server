import { recordToolCall, recordToolSuccess, recordToolFailure, StatsTracker } from '../src/stats';
import type { ToolUsageStats } from '../src/types';

describe('pure stat functions', () => {
    const empty: ToolUsageStats = {};

    test('recordToolCall creates entry and increments total', () => {
        const result = recordToolCall(empty, 'read_note');
        expect(result).toEqual({ read_note: { total: 1, successful: 0, failed: 0 } });
        // Original not mutated
        expect(empty).toEqual({});
    });

    test('recordToolSuccess increments successful', () => {
        const after = recordToolSuccess(
            { read_note: { total: 1, successful: 0, failed: 0 } },
            'read_note',
        );
        expect(after.read_note.successful).toBe(1);
    });

    test('recordToolFailure increments failed', () => {
        const after = recordToolFailure(
            { read_note: { total: 1, successful: 0, failed: 0 } },
            'read_note',
        );
        expect(after.read_note.failed).toBe(1);
    });

    test('functions do not mutate input', () => {
        const original: ToolUsageStats = { x: { total: 5, successful: 3, failed: 2 } };
        const frozen = JSON.parse(JSON.stringify(original));
        recordToolCall(original, 'x');
        recordToolSuccess(original, 'x');
        recordToolFailure(original, 'x');
        expect(original).toEqual(frozen);
    });
});

describe('StatsTracker', () => {
    test('track wraps handler and records success', async () => {
        let stats: ToolUsageStats = {};
        const persist = jest.fn().mockResolvedValue(undefined);
        const tracker = new StatsTracker(
            () => stats,
            (s) => { stats = s; },
            persist,
        );

        const handler = tracker.track('test_tool', async () => {
            return { content: [{ type: 'text' as const, text: 'ok' }] };
        });

        const result = await handler();
        expect(result.content[0].text).toBe('ok');
        expect(stats.test_tool.total).toBe(1);
        expect(stats.test_tool.successful).toBe(1);
        expect(stats.test_tool.failed).toBe(0);
        await tracker.flush();
    });

    test('track wraps handler and records failure', async () => {
        let stats: ToolUsageStats = {};
        const persist = jest.fn().mockResolvedValue(undefined);
        const tracker = new StatsTracker(
            () => stats,
            (s) => { stats = s; },
            persist,
        );

        const handler = tracker.track('fail_tool', async () => {
            throw new Error('boom');
        });

        await expect(handler()).rejects.toThrow('boom');
        expect(stats.fail_tool.total).toBe(1);
        expect(stats.fail_tool.successful).toBe(0);
        expect(stats.fail_tool.failed).toBe(1);
        await tracker.flush();
    });

    test('flush persists and clears dirty state', async () => {
        let stats: ToolUsageStats = {};
        const persist = jest.fn().mockResolvedValue(undefined);
        const tracker = new StatsTracker(
            () => stats,
            (s) => { stats = s; },
            persist,
        );

        const handler = tracker.track('tool', async () => ({ content: [] }));
        await handler();

        await tracker.flush();
        expect(persist).toHaveBeenCalled();
    });

    test('track forwards arguments to the handler', async () => {
        let stats: ToolUsageStats = {};
        const persist = jest.fn().mockResolvedValue(undefined);
        const tracker = new StatsTracker(
            () => stats,
            (s) => { stats = s; },
            persist,
        );

        const handler = tracker.track('arg_tool', async (args: { path: string }) => {
            return { content: [{ type: 'text' as const, text: args.path }] };
        });

        const result = await handler({ path: 'Notes/Test.md' });
        expect(result.content[0].text).toBe('Notes/Test.md');
        expect(stats.arg_tool.total).toBe(1);
        expect(stats.arg_tool.successful).toBe(1);
        await tracker.flush();
    });

    test('flush without activity does not persist', async () => {
        const persist = jest.fn().mockResolvedValue(undefined);
        const tracker = new StatsTracker(
            () => ({}),
            () => {},
            persist,
        );

        await tracker.flush();
        expect(persist).not.toHaveBeenCalled();
    });

    test('onToolResult callback fires with sessionId on success', async () => {
        let stats: ToolUsageStats = {};
        const persist = jest.fn().mockResolvedValue(undefined);
        const tracker = new StatsTracker(
            () => stats,
            (s) => { stats = s; },
            persist,
        );

        const onToolResult = jest.fn();
        tracker.setOnToolResult(onToolResult);

        const handler = tracker.track('read_note', async (_params: { path: string }) => {
            return { content: [{ type: 'text' as const, text: 'ok' }] };
        });

        await handler({ path: 'test.md' }, { sessionId: 'session-123' } as never);
        expect(onToolResult).toHaveBeenCalledWith('session-123', 'read_note', true);
        await tracker.flush();
    });

    test('onToolResult callback fires with sessionId on failure', async () => {
        let stats: ToolUsageStats = {};
        const persist = jest.fn().mockResolvedValue(undefined);
        const tracker = new StatsTracker(
            () => stats,
            (s) => { stats = s; },
            persist,
        );

        const onToolResult = jest.fn();
        tracker.setOnToolResult(onToolResult);

        const handler = tracker.track('fail_tool', async () => {
            throw new Error('boom');
        });

        await expect(handler({}, { sessionId: 'session-456' } as never)).rejects.toThrow('boom');
        expect(onToolResult).toHaveBeenCalledWith('session-456', 'fail_tool', false);
        await tracker.flush();
    });

    test('track works without onToolResult callback', async () => {
        let stats: ToolUsageStats = {};
        const persist = jest.fn().mockResolvedValue(undefined);
        const tracker = new StatsTracker(
            () => stats,
            (s) => { stats = s; },
            persist,
        );

        const handler = tracker.track('tool', async () => {
            return { content: [] };
        });

        await handler({}, { sessionId: 'session-789' } as never);
        expect(stats.tool.successful).toBe(1);
        await tracker.flush();
    });

    test('onToolResult not called when no sessionId in extra', async () => {
        let stats: ToolUsageStats = {};
        const persist = jest.fn().mockResolvedValue(undefined);
        const tracker = new StatsTracker(
            () => stats,
            (s) => { stats = s; },
            persist,
        );

        const onToolResult = jest.fn();
        tracker.setOnToolResult(onToolResult);

        const handler = tracker.track('tool', async () => {
            return { content: [] };
        });

        await handler();
        expect(onToolResult).not.toHaveBeenCalled();
        await tracker.flush();
    });

    test('onToolResult fires when sessionId is in first arg (no-inputSchema tools)', async () => {
        let stats: ToolUsageStats = {};
        const persist = jest.fn().mockResolvedValue(undefined);
        const tracker = new StatsTracker(
            () => stats,
            (s) => { stats = s; },
            persist,
        );

        const onToolResult = jest.fn();
        tracker.setOnToolResult(onToolResult);

        // Tools without inputSchema receive (extra) as the only arg
        const handler = tracker.track('get_active_file', async () => {
            return { content: [{ type: 'text' as const, text: 'ok' }] };
        });

        await handler({ sessionId: 'session-no-schema' } as never);
        expect(onToolResult).toHaveBeenCalledWith('session-no-schema', 'get_active_file', true);
        await tracker.flush();
    });
});
