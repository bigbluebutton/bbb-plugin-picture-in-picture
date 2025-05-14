import { BbbPluginSdk } from 'bigbluebutton-html-plugin-sdk';
import * as React from 'react';
import { useEffect, useRef } from 'react';
import { VIDEO_STREAMS_SUBSCRIPTION } from './graphql/queries';
import { VideoStreamsSubscriptionResult } from './graphql/types';

const isPipSupported = 'documentPictureInPicture' in window;

const cssRules = `
  * {
    box-sizing: border-box;
  }
  
  #videoWrapper {
    height: 100%;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px;
  }

  video {
    height: 240px;
    border-radius: 8px;
  }

  html {
    height: 100%;
  }

  body {
    background-color: #06172A;
  }
`;

interface PluginHelloWorldProps {
  pluginUuid: string;
}

function PluginHelloWorld(
  { pluginUuid }: PluginHelloWorldProps,
): React.ReactElement<PluginHelloWorldProps> {
  BbbPluginSdk.initialize(pluginUuid);
  const pluginApi = BbbPluginSdk.getPluginApi(pluginUuid);

  const { data: videoStreams } = pluginApi.useCustomSubscription<
    VideoStreamsSubscriptionResult
  >(VIDEO_STREAMS_SUBSCRIPTION);

  const pipWindowRef = useRef<Window>();
  const cameraElementsRef = useRef<HTMLDivElement[]>();
  const [cameraDomElements, setCameraDomElements] = React.useState<HTMLDivElement[]>([]);
  const [observer, setObserver] = React.useState<ResizeObserver>();

  useEffect(() => {
    if (videoStreams?.user_camera?.length && !observer) {
      const obs = new ResizeObserver(() => {
        const videoList = document.getElementsByClassName('video-provider_list')[0];
        if (videoList) {
          setCameraDomElements(Array.from(videoList.children ?? []) as HTMLDivElement[]);
        } else {
          setCameraDomElements([]);
        }
      });

      const videoList = document.getElementsByClassName('video-provider_list')[0];

      if (videoList) {
        obs.observe(videoList);
        setObserver(obs);
      }
    }
  }, [videoStreams, observer, setObserver, setCameraDomElements]);

  useEffect(() => {
    cameraElementsRef.current = cameraDomElements;

    if (cameraDomElements.length && pipWindowRef.current) {
      const videoWrapper = document.createElement('div');
      videoWrapper.id = 'videoWrapper';

      const oldVideoWrapper = pipWindowRef.current.document.querySelector('#videoWrapper');

      if (oldVideoWrapper) {
        const streamIds = cameraDomElements.map((el) => (el.querySelector('.videoContainer') as HTMLElement)?.dataset.stream);

        Array.from(oldVideoWrapper.children).forEach((el: HTMLVideoElement) => {
          if (streamIds.includes(el.dataset.stream)) {
            videoWrapper.append(el);
          }
        });
      }

      cameraDomElements.forEach((el) => {
        const videoContainer = el.querySelector('.videoContainer') as HTMLElement;
        const video = videoContainer.querySelector('video');
        if (!video) return;
        video.dataset.stream = videoContainer.dataset.stream;
        videoWrapper.append(video);
      });

      pipWindowRef.current.document.body.replaceChildren(videoWrapper);
    } else if (!cameraDomElements.length && pipWindowRef.current) {
      pipWindowRef.current.close();
      pipWindowRef.current = null;
    }
  }, [cameraDomElements]);

  useEffect(() => {
    // @ts-expect-error undocumented
    navigator.mediaSession.setActionHandler('enterpictureinpicture', async () => {
      const shouldStartPipWindow = cameraElementsRef.current
        && cameraElementsRef.current.length > 0
        && isPipSupported;

      if (shouldStartPipWindow) {
        try {
          // @ts-expect-error undocumented
          const newPipWindow = await documentPictureInPicture.requestWindow({
            height: 256,
            width: 400,
          });

          const handlePageHide = (event: PageTransitionEvent) => {
            const wrapper = (event.target as Document).querySelector('#videoWrapper');
            Array.from(wrapper.children).forEach((el: HTMLVideoElement) => {
              const videoContainer = document.querySelector(`.videoContainer[data-stream="${el.dataset.stream}"]`);
              if (videoContainer) {
                videoContainer.append(el);
                // eslint-disable-next-line no-param-reassign
                delete el.dataset.stream;
              }
            });
            pipWindowRef.current = null;
          };

          if (cameraElementsRef.current && cameraElementsRef.current.length) {
            const videoWrapper = document.createElement('div');
            videoWrapper.id = 'videoWrapper';

            cameraElementsRef.current.forEach((el) => {
              const videoContainer = el.querySelector('.videoContainer') as HTMLElement;
              const video = videoContainer.querySelector('video');
              if (!video) return;
              video.dataset.stream = videoContainer.dataset.stream;
              videoWrapper.append(video);
            });

            newPipWindow.document.body.replaceChildren(videoWrapper);
          }

          newPipWindow.addEventListener('pagehide', handlePageHide, { once: true });

          const style = document.createElement('style');
          style.textContent = cssRules;
          newPipWindow.document.head.appendChild(style);

          const link = document.createElement('link');
          link.rel = 'stylesheet';
          link.type = 'text/css';
          link.href = 'stylesheets/normalize.css';
          newPipWindow.document.head.appendChild(link);

          pipWindowRef.current = newPipWindow;
        } catch (error) {
          console.error(error);
        }
      }
    });
  }, []);

  return null;
}
export default PluginHelloWorld;
