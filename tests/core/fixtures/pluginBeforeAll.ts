/* eslint-disable import/no-extraneous-dependencies */
import { TestInfo, APIRequestContext } from '@playwright/test';
import { secret, server } from '../parameters';

export type SampleBeforeAllConfig = {
  pluginName: string;
  setPluginUrl: (url: string) => void;
  getPluginUrl?: () => string | undefined;
};

export function checkPluginAvailability(config: SampleBeforeAllConfig) {
  return async ({ request }: { request: APIRequestContext }, testInfo: TestInfo): Promise<void> => {
    // Check if custom URL is already provided via environment variable
    const customUrl = config.getPluginUrl?.();
    if (customUrl) {
      config.setPluginUrl(customUrl);
      return;
    }

    const BBB_URL_PATTERN = /^https:\/\/[^/]+\/bigbluebutton\/$/;
    if (!secret) throw new Error('BBB_SECRET environment variable is not set');
    if (!server) throw new Error('BBB_URL environment variable is not set');
    if (!BBB_URL_PATTERN.test(server)) throw new Error('BBB_URL must follow the pattern "https://DOMAIN_NAME/bigbluebutton/"');

    const serverDomain = new URL(server).origin;
    const manifestUrlPath = `/plugins/${config.pluginName}/dist/manifest.json`;
    const pluginUrl = `${serverDomain}${manifestUrlPath}`;

    // An unreachable manifest is a hard failure, not a skip. BBB_URL and
    // BBB_SECRET are set by this point (the checks above throw otherwise), so
    // the suite was deliberately pointed at a server - silently skipping every
    // test would report a green run that verified nothing.
    const response = await request.get(pluginUrl);
    if (!response.ok()) {
      throw new Error(
        `Plugin manifest not reachable at ${pluginUrl} (HTTP ${response.status()}), `
        + `required by "${testInfo.title}". Build and deploy the plugin `
        + '(npm run build-bundle && npm run publish-plugin:dev), or point the suite at an '
        + 'already-hosted manifest with PICTURE_IN_PICTURE_PLUGIN_URL.',
      );
    }

    try {
      await response.json();
    } catch (error) {
      throw new Error(
        `Plugin manifest at ${pluginUrl} is not valid JSON, required by "${testInfo.title}": ${error}`,
      );
    }

    config.setPluginUrl(pluginUrl);
  };
}
