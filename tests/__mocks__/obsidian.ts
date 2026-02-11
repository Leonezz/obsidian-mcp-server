export class Plugin {
    app: any;
    constructor(app: any, manifest: any) {
        this.app = app;
    }
    async loadData(): Promise<any> { return {}; }
    async saveData(_data: any): Promise<void> {}
    addSettingTab(_tab: any): void {}
    async onload(): Promise<void> {}
    async onunload(): Promise<void> {}
}

export class PluginSettingTab {
    app: any;
    plugin: any;
    containerEl: any;
    constructor(app: any, plugin: any) {
        this.app = app;
        this.plugin = plugin;
        this.containerEl = { empty: () => {}, createEl: () => ({}) };
    }
    display(): void {}
}

export class Notice {
    constructor(_message: string) {}
}

export class TFile {
    path: string = '';
    name: string = '';
    extension: string = 'md';
    stat: { mtime: number; ctime: number; size: number } = { mtime: 0, ctime: 0, size: 0 };
}

export class TFolder {
    path: string = '';
    name: string = '';
    children: any[] = [];
}

export class App {}

export class Setting {
    constructor(_el: any) {}
    setName(_name: string) { return this; }
    setDesc(_desc: string) { return this; }
    addText(_cb: any) { return this; }
    addTextArea(_cb: any) { return this; }
    addButton(_cb: any) { return this; }
    addExtraButton(_cb: any) { return this; }
}

export type CachedMetadata = {
    tags?: Array<{ tag: string }>;
    frontmatter?: Record<string, any>;
    headings?: Array<{ level: number; heading: string }>;
    links?: Array<{ link: string }>;
};
