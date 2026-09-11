import * as React from 'react';

interface VideoProps {
  srcObject: MediaProvider;
  talking: boolean;
  /**
   * Called when the attached stream stops being able to deliver frames, so the
   * grid can resolve a fresh one. Without it a tile whose stream died keeps
   * rendering its last frame indefinitely: the element still reports a healthy
   * readyState and still reports itself as playing, so nothing else notices.
   */
  onStalled?: () => void;
}

function Video({ srcObject, talking, onStalled }: VideoProps) {
  const onStalledRef = React.useRef(onStalled);
  onStalledRef.current = onStalled;
  const elementRef = React.useRef<HTMLVideoElement | null>(null);

  const attachVideo = React.useCallback((ref: HTMLVideoElement | null) => {
    elementRef.current = ref;
    if (ref) {
      // eslint-disable-next-line no-param-reassign
      ref.srcObject = srcObject;
    }
  }, [srcObject]);

  // Cleanup returned from a callback ref is only honoured by React 19, so the
  // listeners live in an effect instead - otherwise they would leak on every
  // stream change.
  React.useEffect(() => {
    if (!(srcObject instanceof MediaStream)) return undefined;

    const notify = () => onStalledRef.current?.();
    // On a remote WebRTC track 'mute' means media stopped arriving, and 'ended'
    // means the track is gone for good. Both are subscribed on transitions
    // only, so re-resolving to the same already-muted stream cannot loop.
    let tracks: MediaStreamTrack[] = [];
    const listenToTracks = () => {
      tracks.forEach((track) => {
        track.removeEventListener('mute', notify);
        track.removeEventListener('ended', notify);
      });
      tracks = srcObject.getVideoTracks();
      tracks.forEach((track) => {
        track.addEventListener('mute', notify);
        track.addEventListener('ended', notify);
      });
    };

    listenToTracks();
    // A renegotiation can swap tracks inside the same MediaStream; the
    // replacement track needs the same listeners or its stalls go unseen.
    srcObject.addEventListener('addtrack', listenToTracks);
    srcObject.addEventListener('removetrack', listenToTracks);

    return () => {
      srcObject.removeEventListener('addtrack', listenToTracks);
      srcObject.removeEventListener('removetrack', listenToTracks);
      tracks.forEach((track) => {
        track.removeEventListener('mute', notify);
        track.removeEventListener('ended', notify);
      });
    };
  }, [srcObject]);

  // The autoplay attribute is a one-shot: it only acts when media first loads.
  // An element paused later - browsers may pause a playing <video> when its
  // node is moved in the DOM, among other causes outside this component's
  // control - would otherwise stay frozen on its last frame forever.
  React.useEffect(() => {
    const element = elementRef.current;
    if (!element) return undefined;

    const resume = () => {
      element.play().catch(() => {
        // A detached (unmounting) element rejects play(); nothing to resume.
      });
    };
    element.addEventListener('pause', resume);

    return () => element.removeEventListener('pause', resume);
  }, [srcObject]);

  const className = [];

  if (talking) {
    className.push('talking');
  }

  return (
    <video
      autoPlay
      playsInline
      muted
      ref={attachVideo}
      className={className.join(' ')}
    />
  );
}

export default Video;
