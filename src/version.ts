// Version configuration
export const APP_VERSION = '1.5.0';
export const BUILD_NUMBER = '29';
export const BUILD_DATE = '2026-06-17';

export const getFullVersion = () => {
  return `v${APP_VERSION} (Build ${BUILD_NUMBER})`;
};
