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
