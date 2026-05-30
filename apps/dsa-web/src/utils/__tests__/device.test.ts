import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { isMobileDevice, isDesktopRoute, isMobileRoute, MOBILE_HOME_PATH } from '../device';

describe('device utils', () => {
  describe('MOBILE_HOME_PATH', () => {
    it('should be /m', () => {
      expect(MOBILE_HOME_PATH).toBe('/m');
    });
  });

  describe('isDesktopRoute', () => {
    it('returns true for known desktop routes', () => {
      expect(isDesktopRoute('/')).toBe(true);
      expect(isDesktopRoute('/chat')).toBe(true);
      expect(isDesktopRoute('/portfolio')).toBe(true);
      expect(isDesktopRoute('/backtest')).toBe(true);
      expect(isDesktopRoute('/alerts')).toBe(true);
      expect(isDesktopRoute('/settings')).toBe(true);
    });

    it('returns false for non-desktop routes', () => {
      expect(isDesktopRoute('/m')).toBe(false);
      expect(isDesktopRoute('/login')).toBe(false);
      expect(isDesktopRoute('/unknown')).toBe(false);
    });
  });

  describe('isMobileRoute', () => {
    it('returns true for /m', () => {
      expect(isMobileRoute('/m')).toBe(true);
    });

    it('returns false for other routes', () => {
      expect(isMobileRoute('/')).toBe(false);
      expect(isMobileRoute('/chat')).toBe(false);
      expect(isMobileRoute('/unknown')).toBe(false);
    });
  });

  describe('isMobileDevice', () => {
    const originalNavigator = global.navigator;

    beforeEach(() => {
      vi.clearAllMocks();
    });

    afterEach(() => {
      Object.defineProperty(global, 'navigator', {
        value: originalNavigator,
        writable: true,
        configurable: true,
      });
    });

    it('returns false when navigator is undefined', () => {
      Object.defineProperty(global, 'navigator', {
        value: undefined,
        writable: true,
        configurable: true,
      });
      expect(isMobileDevice()).toBe(false);
    });

    it('returns true for Android UA', () => {
      Object.defineProperty(global, 'navigator', {
        value: { userAgent: 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36' },
        writable: true,
        configurable: true,
      });
      expect(isMobileDevice()).toBe(true);
    });

    it('returns true for iPhone UA', () => {
      Object.defineProperty(global, 'navigator', {
        value: { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)' },
        writable: true,
        configurable: true,
      });
      expect(isMobileDevice()).toBe(true);
    });

    it('returns true for iPad UA', () => {
      Object.defineProperty(global, 'navigator', {
        value: { userAgent: 'Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X)' },
        writable: true,
        configurable: true,
      });
      expect(isMobileDevice()).toBe(true);
    });

    it('returns false for desktop UA', () => {
      Object.defineProperty(global, 'navigator', {
        value: {
          userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
          maxTouchPoints: 0,
        },
        writable: true,
        configurable: true,
      });
      expect(isMobileDevice()).toBe(false);
    });

    it('returns true for touch device with small screen', () => {
      Object.defineProperty(global, 'navigator', {
        value: {
          userAgent: 'Mozilla/5.0 (Unknown)',
          maxTouchPoints: 5,
        },
        writable: true,
        configurable: true,
      });
      Object.defineProperty(global, 'window', {
        value: { screen: { width: 375 } },
        writable: true,
        configurable: true,
      });
      expect(isMobileDevice()).toBe(true);
    });

    it('returns false for touch device with large screen', () => {
      Object.defineProperty(global, 'navigator', {
        value: {
          userAgent: 'Mozilla/5.0 (Unknown)',
          maxTouchPoints: 5,
        },
        writable: true,
        configurable: true,
      });
      Object.defineProperty(global, 'window', {
        value: { screen: { width: 1920 } },
        writable: true,
        configurable: true,
      });
      expect(isMobileDevice()).toBe(false);
    });
  });
});
