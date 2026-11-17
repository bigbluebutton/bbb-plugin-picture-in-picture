import * as React from 'react';
import Video from './video';

interface WebcamItemProps {
  streamId: string;
  srcObject: MediaStream;
  userTalking: boolean;
  userName: string;
  /**
   * Visual position in the grid (CSS 'order'). Tiles are kept in a stable DOM
   * order - moving a live <video> element can freeze it - so ordering is
   * purely visual.
   */
  order?: number;
  onStalled?: () => void;
}

function WebcamItem({
  streamId, srcObject, userTalking, userName, order, onStalled,
}: WebcamItemProps) {
  const [squeezed, setSqueezed] = React.useState(false);
  const observerRef = React.useRef<ResizeObserver | null>(null);

  const updateRef = React.useCallback((ref: HTMLDivElement | null) => {
    if (observerRef.current) {
      observerRef.current.disconnect();
    }
    if (ref) {
      observerRef.current = new ResizeObserver((entries) => {
        setSqueezed(entries[0] && entries[0].contentRect.width < 140);
      });

      observerRef.current.observe(ref);
    }
  }, []);

  return (
    <div key={streamId} ref={updateRef} className="pip-video-container" style={{ order }}>
      <Video srcObject={srcObject} talking={userTalking} onStalled={onStalled} />
      {!squeezed && (
        <span className="username">
          {userName}
        </span>
      )}
    </div>
  );
}

export default WebcamItem;
