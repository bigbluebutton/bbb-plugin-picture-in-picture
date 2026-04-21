import * as React from 'react';
import { PluginApi, PresentationWhiteboardUiDataNames } from 'bigbluebutton-html-plugin-sdk';
import { useLayoutContext } from '../contexts/layout';
import { useRerenderRef } from '../../../common/hooks';
import { usePipWindow } from '../contexts/pip-window';

interface SlideComponentProps {
  pluginApi: PluginApi;
  hasScreenshare?: boolean;
}

function SlideComponent({ pluginApi, hasScreenshare }: SlideComponentProps): React.ReactNode {
  const [image, setImage] = React.useState<string | null>(null);
  const { screenshare: screenshareRect } = useLayoutContext();
  const slideRef = useRerenderRef<HTMLDivElement>(null);
  const pipWindow = usePipWindow();

  React.useEffect(() => {
    const update = async () => {
      const getter = pluginApi?.getUiData;

      if (getter) {
        getter(PresentationWhiteboardUiDataNames.CURRENT_PAGE_SNAPSHOT).then((data) => {
          setImage(data?.base64Png ?? null);
        }).catch(() => {
          // eslint-disable-next-line no-console
          console.warn('Couldn\'t refresh snapshot of current slide');
        });
      }
    };

    update();

    const intervalId = setInterval(update, 5000);

    return () => {
      clearInterval(intervalId);
    };
  }, []);

  if (!image || hasScreenshare) return null;

  const paddingInline = slideRef.current ? parseInt(pipWindow.getComputedStyle(slideRef.current)
    .getPropertyValue('padding-inline'), 10) : 8;
  const paddingBlock = slideRef.current ? parseInt(pipWindow.getComputedStyle(slideRef.current)
    .getPropertyValue('padding-block'), 10) : 8;
  const imgWidth = Math.min(
    screenshareRect.height - (paddingBlock * 2),
    screenshareRect.width - (paddingInline * 2),
  );

  return (
    <div
      style={{
        position: 'absolute',
        left: screenshareRect.x,
        top: screenshareRect.y,
        width: screenshareRect.width,
        height: screenshareRect.height,
        display: 'grid',
        placeItems: 'center',
        padding: '0.5rem',
      }}
      ref={slideRef}
    >
      <img src={image} alt="current slide" style={{ width: `${imgWidth}px` }} />
    </div>
  );
}

export default SlideComponent;
