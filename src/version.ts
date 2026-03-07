// Version configuration
export const APP_VERSION = '1.3.10';
export const BUILD_NUMBER = '21';
export const BUILD_DATE = '2026-03-07';

export const getFullVersion = () => {
  return `v${APP_VERSION} (Build ${BUILD_NUMBER})`;
};
