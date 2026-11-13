import { isDevMode } from '@angular/core';

import { log } from './log';

describe('Optional analytics', () => {
  it('keeps a production application usable when no analytics script is registered', () => {
    const originalMode = Object.getOwnPropertyDescriptor(
      globalThis,
      'ngDevMode',
    );
    const originalAnalytics = Object.getOwnPropertyDescriptor(
      globalThis,
      'gtag',
    );
    try {
      Reflect.set(globalThis, 'ngDevMode', false);
      Reflect.deleteProperty(globalThis, 'gtag');
      expect(isDevMode()).toBeFalse();
      expect(() => {
        log('workspace_loaded', 'aef');
      }).not.toThrow();
    } finally {
      if (originalMode)
        Object.defineProperty(globalThis, 'ngDevMode', originalMode);
      else Reflect.deleteProperty(globalThis, 'ngDevMode');
      if (originalAnalytics)
        Object.defineProperty(globalThis, 'gtag', originalAnalytics);
      else Reflect.deleteProperty(globalThis, 'gtag');
    }
  });
});
