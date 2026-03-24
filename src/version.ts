// Version configuration
export const APP_VERSION = '1.3.14';
export const BUILD_NUMBER = '25';
export const BUILD_DATE = '2026-03-24';

export const getFullVersion = () => {
  return `v${APP_VERSION} (Build ${BUILD_NUMBER})`;
};
