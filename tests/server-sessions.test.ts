import { recordToolCall, recordToolSuccess, recordToolFailure } from '../src/stats';
import type { ToolUsageStats } from '../src/types';

describe('session tool stats recording', () => {
    test('recordSessionToolCall equivalent: records call + success', () => {
        let stats: ToolUsageStats = {};
        stats = recordToolCall(stats, 'read_note');
        stats = recordToolSuccess(stats, 'read_note');

        expect(stats.read_note).toEqual({ total: 1, successful: 1, failed: 0 });
    });

    test('recordSessionToolCall equivalent: records call + failure', () => {
        let stats: ToolUsageStats = {};
        stats = recordToolCall(stats, 'read_note');
        stats = recordToolFailure(stats, 'read_note');

        expect(stats.read_note).toEqual({ total: 1, successful: 0, failed: 1 });
    });

    test('session summary aggregation logic', () => {
        const toolStats: ToolUsageStats = {
            read_note: { total: 5, successful: 4, failed: 1 },
            list_folder: { total: 3, successful: 3, failed: 0 },
        };

        const totals = Object.values(toolStats).reduce(
            (acc, s) => ({
                total: acc.total + s.total,
                successful: acc.successful + s.successful,
                failed: acc.failed + s.failed,
            }),
            { total: 0, successful: 0, failed: 0 },
        );

        expect(totals).toEqual({ total: 8, successful: 7, failed: 1 });
    });

    test('session summary with empty toolStats', () => {
        const toolStats: ToolUsageStats = {};
        const totals = Object.values(toolStats).reduce(
            (acc, s) => ({
                total: acc.total + s.total,
                successful: acc.successful + s.successful,
                failed: acc.failed + s.failed,
            }),
            { total: 0, successful: 0, failed: 0 },
        );

        expect(totals).toEqual({ total: 0, successful: 0, failed: 0 });
    });
});
