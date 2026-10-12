// Jest runs in Node, where Obsidian's `window` doesn't exist; expose the timers plugin code uses.
import { TestEnvironment } from 'jest-environment-node';

export default class ObsidianShimEnvironment extends TestEnvironment {
    async setup(): Promise<void> {
        await super.setup();
        const sandbox = this.global;
        sandbox.window = {
            setTimeout: sandbox.setTimeout,
            clearTimeout: sandbox.clearTimeout,
            setInterval: sandbox.setInterval,
            clearInterval: sandbox.clearInterval,
        } as unknown as typeof sandbox.window;
    }
}
