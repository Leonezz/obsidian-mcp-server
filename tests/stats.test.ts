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
});
