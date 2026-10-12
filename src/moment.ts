import { moment as obsidianMoment } from 'obsidian';
import type * as MomentNS from 'moment';

/**
 * Obsidian's runtime moment, typed from the root `moment` package so its type
 * resolves even when `obsidian.d.ts` can't see its own `moment` dependency.
 */
export const moment = obsidianMoment as unknown as typeof MomentNS;
