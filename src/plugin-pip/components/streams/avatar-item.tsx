import * as React from 'react';

interface AvatarItemProps {
  userName: string | null;
  avatar: string | null;
  color: string | null;
  userTalking: boolean;
}

function AvatarItem({
  userName, avatar, color, userTalking,
}: AvatarItemProps) {
  const [squeezed, setSqueezed] = React.useState(false);
  const [avatarFailed, setAvatarFailed] = React.useState(false);
  const observerRef = React.useRef<ResizeObserver | null>(null);

  React.useEffect(() => {
    setAvatarFailed(false);
  }, [avatar]);

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

  const className = ['pip-video-container', 'pip-avatar-item'];
  if (userTalking) {
    className.push('talking');
  }

  return (
    <div
      ref={updateRef}
      className={className.join(' ')}
      style={{ '--avatar-color': color } as React.CSSProperties}
    >
      {avatar && !avatarFailed ? (
        <img src={avatar} alt={userName ?? ''} onError={() => setAvatarFailed(true)} />
      ) : (
        <div className="pip-avatar-circle" style={{ backgroundColor: color ?? undefined }}>
          {userName?.charAt(0)}
        </div>
      )}
      {!squeezed && (
        <span className="username">
          {userName}
        </span>
      )}
    </div>
  );
}

export default AvatarItem;
