import { useMemo, useRef, useState } from 'react';
import { createIntl, createIntlCache } from 'react-intl';
import { PluginApi } from 'bigbluebutton-html-plugin-sdk';

const LOCALE_REQUEST_OBJECT = (!process.env.NODE_ENV || process.env.NODE_ENV === 'development')
  ? {
    headers: {
      'ngrok-skip-browser-warning': 'any',
    },
  } : undefined;

export const useI18n = (pluginApi: PluginApi) => {
  const {
    messages: localeMessages,
    currentLocale,
    loading: localeMessagesLoading,
  } = pluginApi.useLocaleMessages!(LOCALE_REQUEST_OBJECT);

  const cache = createIntlCache();
  const intl = (!localeMessagesLoading && localeMessages) ? createIntl({
    locale: currentLocale,
    messages: localeMessages,
    fallbackOnEmptyString: true,
  }, cache) : null;

  return {
    intl,
    localeMessagesLoading,
  };
};

const CURRENT_FIELD = 'current';

/**
 * This hook returns a proxied ref. Whenever the "current" field of the ref gets updated
 * the hook forces a new render of the components using it so we can grab its latest value
 * at render time.
 */
export const useRerenderRef = <T = unknown>(initialValue: T | null) => {
  const [, setCurrent] = useState<T | null>(null);
  const ref = useRef<T | null>(initialValue);

  const proxy = useMemo(
    () => new Proxy(ref, {
      set(target, field, newValue, receiver) {
        const success = Reflect.set(target, field, newValue, receiver);
        if (field === CURRENT_FIELD) {
          setCurrent(newValue);
        }
        return success;
      },
    }),
    [],
  );

  return proxy;
};
