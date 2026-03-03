// Version configuration
export const APP_VERSION = '1.3.4';
export const BUILD_NUMBER = '15';
export const BUILD_DATE = '2026-03-03';

export const getFullVersion = () => {
  return `v${APP_VERSION} (Build ${BUILD_NUMBER})`;
};
