// Version configuration
export const APP_VERSION = '1.3.15';
export const BUILD_NUMBER = '26';
export const BUILD_DATE = '2026-03-25';

export const getFullVersion = () => {
  return `v${APP_VERSION} (Build ${BUILD_NUMBER})`;
};
