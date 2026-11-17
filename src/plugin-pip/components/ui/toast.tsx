import * as React from 'react';
import { IntlShape, defineMessages } from 'react-intl';

const intlMessages = defineMessages({
  toastClose: {
    id: 'plugin.toast.close',
    defaultMessage: 'Close notification',
  },
});

export type ToastType = 'default' | 'success' | 'error' | 'warning' | 'info';

export interface Toast {
  id: string;
  content: React.ReactNode;
  type: ToastType;
  duration?: number;
  dismissible?: boolean;
}

interface ToastContextValue {
  toasts: Toast[];
  showToast: (
    content: React.ReactNode,
    type?: ToastType,
    duration?: number,
    dismissible?: boolean,
    idPrefix?: string,
  ) => void;
  hideToast: (id: string) => void;
}

export const getBackgroundColor = (type: ToastType): string => {
  const colors: Record<ToastType, string> = {
    default: '#303030',
    success: '#10b981',
    error: '#ef4444',
    warning: '#f59e0b',
    info: '#3b82f6',
  };
  return colors[type];
};

export const getIcon = (type: ToastType): string | undefined => {
  const icons: Partial<Record<ToastType, string>> = {
    success: '✓',
    error: '✕',
    warning: '⚠',
    info: 'ℹ',
  };
  return icons[type];
};

const ToastContext = React.createContext<ToastContextValue | undefined>(undefined);

interface ToastProviderProps {
  children: React.ReactNode;
  intl: IntlShape;
}

interface ToastItemProps {
  intl: IntlShape;
  toast: Toast;
  onClose: (id: string) => void;
}

interface ToastContainerProps {
  intl: IntlShape;
  toasts: Toast[];
  onClose: (id: string) => void;
}

function ToastItem({ intl, toast, onClose }: ToastItemProps) {
  const [isVisible, setIsVisible] = React.useState(false);
  const [isLeaving, setIsLeaving] = React.useState(false);
  const [isHovering, setIsHovering] = React.useState(false);

  React.useEffect(() => {
    setTimeout(() => setIsVisible(true), 10);
  }, []);

  const handleClose = () => {
    setIsLeaving(true);
    setTimeout(() => {
      onClose(toast.id);
    }, 300);
  };

  const getTransform = () => {
    if (isLeaving) {
      return 'translateX(400px)';
    }
    if (isVisible) {
      return 'translateX(0)';
    }
    return 'translateX(400px)';
  };

  const getOpacity = () => {
    if (isLeaving) {
      return 0;
    }
    if (isVisible) {
      return 1;
    }
    return 0;
  };

  const toastStyles: React.CSSProperties = {
    backgroundColor: getBackgroundColor(toast.type),
    color: '#fff',
    padding: '0.75rem',
    borderRadius: '0.5rem',
    boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1), 0 2px 4px rgba(0, 0, 0, 0.06)',
    display: 'flex',
    alignItems: 'flex-start',
    gap: '0.75rem',
    minWidth: '200px',
    maxWidth: '300px',
    pointerEvents: 'auto',
    transform: getTransform(),
    opacity: getOpacity(),
    transition: 'all 0.3s ease-in-out',
    position: 'relative',
  };

  const iconStyles: React.CSSProperties = {
    fontSize: '20px',
    fontWeight: 'bold',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: '20px',
  };

  const messageStyles: React.CSSProperties = {
    flex: 1,
    fontSize: '14px',
    lineHeight: '1.5',
  };

  const closeButtonStyles: React.CSSProperties = {
    background: 'none',
    border: 'none',
    borderRadius: '50%',
    color: '#fff',
    fontSize: '14px',
    cursor: 'pointer',
    padding: '0',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '16px',
    height: '16px',
    opacity: isHovering ? 1 : 0.8,
    transition: 'opacity 0.2s',
    position: 'absolute',
    right: '2px',
    top: '2px',
  };

  return (
    <div style={toastStyles}>
      {getIcon(toast.type) && <div style={iconStyles}>{getIcon(toast.type)}</div>}
      <div style={messageStyles}>{toast.content}</div>
      {toast.dismissible && (
        <button
          type="button"
          onClick={handleClose}
          onMouseEnter={() => setIsHovering(true)}
          onMouseLeave={() => setIsHovering(false)}
          style={closeButtonStyles}
          aria-label={intl.formatMessage(intlMessages.toastClose)}
        >
          ×
        </button>
      )}
    </div>
  );
}

function ToastContainer({ toasts, onClose, intl }: ToastContainerProps) {
  const containerStyles: React.CSSProperties = {
    position: 'fixed',
    top: '20px',
    bottom: '20px',
    right: '20px',
    zIndex: 9998,
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    pointerEvents: 'none',
    overflowX: 'hidden',
    overflowY: 'auto',
  };

  return (
    <div style={containerStyles}>
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onClose={onClose} intl={intl} />
      ))}
    </div>
  );
}

export function ToastProvider({ children, intl }: ToastProviderProps) {
  const [toasts, setToasts] = React.useState<Toast[]>([]);

  const hideToast = React.useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const showToast = React.useCallback((
    content: React.ReactNode,
    type: ToastType = 'default',
    duration: number = 3000,
    dismissible: boolean = true,
    idPrefix: string = 'toast',
  ) => {
    const id = `${idPrefix}-${Date.now()}-${Math.random()}`;
    const toast: Toast = {
      id,
      content,
      type,
      duration,
      dismissible,
    };

    setToasts((prev) => {
      const t = [toast, ...prev];
      return duration > 0 ? t.slice(0, 3) : t;
    });

    if (duration > 0) {
      setTimeout(() => {
        hideToast(id);
      }, duration);
    }
  }, [hideToast]);

  const value = React.useMemo(
    () => ({
      toasts,
      showToast,
      hideToast,
    }),
    [toasts, showToast, hideToast],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastContainer toasts={toasts} onClose={hideToast} intl={intl} />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = React.useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}
