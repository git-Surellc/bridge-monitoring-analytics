// Version configuration
export const APP_VERSION = '1.3.17';
export const BUILD_NUMBER = '28';
export const BUILD_DATE = '2026-04-07';

export const getFullVersion = () => {
  return `v${APP_VERSION} (Build ${BUILD_NUMBER})`;
};
