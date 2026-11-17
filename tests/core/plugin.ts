import { Page, Browser } from '@playwright/test';
import { InitOptions, SessionPage } from './sessionPage';

interface PluginProps {
  browser: Browser;
}

export class Plugin {
  readonly browser: Browser;

  modPage!: SessionPage;

  constructor({ browser }: PluginProps) {
    this.browser = browser;
  }

  async initModPage(page: Page, {
    fullName = 'Moderator',
    shouldCloseAudioModal = true,
    ...restOptions
  }: InitOptions = {}) {
    const options = { fullName, ...restOptions };
    this.modPage = new SessionPage({ browser: this.browser, page });
    await this.modPage.init({ isModerator: true, shouldCloseAudioModal, initOptions: options });
  }
}
