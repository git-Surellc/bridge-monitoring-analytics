// Version configuration
export const APP_VERSION = '1.3.11';
export const BUILD_NUMBER = '22';
export const BUILD_DATE = '2026-03-19';

export const getFullVersion = () => {
  return `v${APP_VERSION} (Build ${BUILD_NUMBER})`;
};
