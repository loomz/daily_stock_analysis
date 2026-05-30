/**
 * 检测设备是否为移动端
 * 通过 User-Agent 和触摸能力综合判断
 */
export function isMobileDevice(): boolean {
  if (typeof navigator === 'undefined') {
    return false;
  }

  // 优先通过 User-Agent 判断
  const ua = navigator.userAgent;
  const mobileKeywords = [
    'Android',
    'iPhone',
    'iPad',
    'iPod',
    'BlackBerry',
    'IEMobile',
    'Opera Mini',
    'Mobile',
    'mobi',
  ];

  if (mobileKeywords.some((keyword) => ua.includes(keyword))) {
    return true;
  }

  // 通过触摸能力辅助判断
  if ('maxTouchPoints' in navigator && navigator.maxTouchPoints > 0) {
    const width = typeof window !== 'undefined' ? window.screen.width : 0;
    if (width < 1024) {
      return true;
    }
  }

  return false;
}

/**
 * 移动端对应的路由路径
 */
export const MOBILE_HOME_PATH = '/m';

/**
 * 需要跳转到移动端的桌面路由
 */
export const DESKTOP_ROUTES = ['/', '/chat', '/portfolio', '/backtest', '/alerts', '/settings'];

/**
 * 判断给定路径是否为桌面端路由
 */
export function isDesktopRoute(pathname: string): boolean {
  return DESKTOP_ROUTES.includes(pathname);
}

/**
 * 判断给定路径是否为移动端路由
 */
export function isMobileRoute(pathname: string): boolean {
  return pathname === MOBILE_HOME_PATH;
}
