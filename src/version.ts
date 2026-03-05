// Version configuration
export const APP_VERSION = '1.3.9';
export const BUILD_NUMBER = '20';
export const BUILD_DATE = '2026-03-05';

export const getFullVersion = () => {
  return `v${APP_VERSION} (Build ${BUILD_NUMBER})`;
};
