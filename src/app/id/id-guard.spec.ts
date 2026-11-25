import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';

import { MockComponent } from '~/tests/mocks/component';
import { TestModule } from '~/tests/test-module';

import { shortcutRoutes } from './id-guard';

describe('shortcut redirects', () => {
  let router: Router;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [TestModule],
      providers: [
        provideRouter([
          ...shortcutRoutes,
          {
            path: 'aef',
            children: ['', 'list', 'flow', 'data'].map((path) => ({
              path,
              component: MockComponent,
            })),
          },
        ]),
      ],
    });
    router = TestBed.inject(Router);
  });

  it('forwards every shortcut with compressed and repeated query parameters unchanged', async () => {
    const harness = await RouterTestingHarness.create('/aef/list');
    for (const shortcut of ['list', 'flow', 'data']) {
      await harness.navigateByUrl(
        `/${shortcut}?v=11&o=a&o=b&cet=x&z=abc&z=def#audit`,
      );
      expect(router.url).toEqual(
        `/aef/${shortcut}?v=11&o=a&o=b&cet=x&z=abc&z=def`,
      );
    }
    for (const shortcut of ['/wizard', '/aef/wizard']) {
      await harness.navigateByUrl(shortcut + '?v=11&o=a&o=b');
      expect(router.url).toBe('/aef?v=11&o=a&o=b');
    }
  });
});
