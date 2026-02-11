export class Plugin {
  app: any;
  constructor(app: any) {
    this.app = app;
  }
  async onload() {}
  async onunload() {}
}

export class Notice {
  constructor(message: string) {}
}

export class TFile {
  path: string;
  stat: any;
}

export class TFolder {
  path: string;
  children: any[];
}
