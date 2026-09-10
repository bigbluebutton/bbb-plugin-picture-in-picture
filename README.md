# Repository of a plugin for BigBlueButton

## Description

A plugin that starts up a picture-in-picture window with webcams and screen sharing in the session.

![Plugin screenshot](demo.png)

## Known limitation: cameras freeze when the main window is backgrounded

When the server's camera bridge is LiveKit and adaptive stream is enabled with its default background-pause behaviour, cameras rendered in the picture-in-picture window may freeze a few seconds after the main BigBlueButton tab is backgrounded. Audio and the main window are not affected; only the mirrored camera tiles stop updating.

Server administrators can work around it by setting `pauseVideoInBackground` to `false` under `public.media.livekit.roomOptions.adaptiveStream` in `/etc/bigbluebutton/bbb-html5.yml`:

```yaml
public:
  media:
    livekit:
      roomOptions:
        adaptiveStream:
          pauseVideoInBackground: false
```

In the default `settings.yml`, `adaptiveStream` is a boolean (`true`), so switching to the object form above is what enables the sub-option. Keep any other `roomOptions` keys already present in the deployment.

With the pause disabled, camera streams keep flowing while the tab is backgrounded, so bandwidth and CPU usage go up for every subscriber, on every meeting on that server. It is a server-wide setting, not a per-plugin one.

This will be fixed properly once the plugin SDK exposes an API to attach a camera track directly to a plugin-owned video element.

Tracking issue: https://github.com/bigbluebutton/bigbluebutton-html-plugin-sdk/issues/290

## Building the Plugin

To build the plugin for production use, follow these steps:

```bash
cd $HOME/src/bbb-plugin-picture-in-picture
npm ci
npm run build-bundle
```

The above command will generate the `dist` folder, containing the bundled JavaScript file named `BbbPluginPictureInPicture.js`. This file can be hosted on any HTTPS server along with its `manifest.json`.

If you install the Plugin separated to the manifest, remember to change the `javascriptEntrypointUrl` in the `manifest.json` to the correct endpoint.

To use the plugin in BigBlueButton, send this parameter along in create call:

```
pluginManifests=[{"url":"<your-domain>/path/to/manifest.json"}]
```

Or additionally, you can add this same configuration in the `.properties` file from `bbb-web` in `/usr/share/bbb-web/WEB-INF/classes/bigbluebutton.properties`


## Development mode

As for development mode (running this plugin from source), please, refer back to https://github.com/bigbluebutton/bigbluebutton-html-plugin-sdk section `Running the Plugin from Source`
