import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';

import { PreferencesStore } from '~/state/preferences/preferences-store';
import { RouterSync } from '~/state/router/router-sync';
import { MockComponent } from '~/tests/mocks/component';
import { TestModule } from '~/tests/test-module';

import { landingGuard } from './landing-guard';

describe('landingGuard', () => {
  let router: Router;
  let preferencesStore: PreferencesStore;
  let routerSync: RouterSync;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [TestModule],
      providers: [
        provideRouter([
          {
            path: 'aef',
            children: [
              {
                path: 'list',
                component: MockComponent,
              },
              {
                path: '',
                pathMatch: 'full',
                canActivate: [landingGuard],
                component: MockComponent,
              },
            ],
          },
          {
            path: '',
            pathMatch: 'full',
            canActivate: [landingGuard],
            component: MockComponent,
          },
        ]),
      ],
    });

    router = TestBed.inject(Router);
    preferencesStore = TestBed.inject(PreferencesStore);
    routerSync = TestBed.inject(RouterSync);
  });

  it('should load the last saved state', async () => {
    spyOn(preferencesStore, 'bypassLanding').and.returnValue(true);
    spyOn(routerSync, 'stored').and.returnValue('/aef/list?v=6');
    await RouterTestingHarness.create('/');
    expect(router.url).toEqual('/aef/list?v=6');
  });

  it('rejects a foreign cached state', async () => {
    spyOn(preferencesStore, 'bypassLanding').and.returnValue(true);
    spyOn(routerSync, 'stored').and.returnValue('/2x1/list?v=6');
    await RouterTestingHarness.create('/');
    expect(router.url).toEqual('/aef/list');
  });

  it('gives explicit root queries priority over cache and does not restore cache for a bare dataset route', async () => {
    spyOn(preferencesStore, 'bypassLanding').and.returnValue(true);
    const stored = spyOn(routerSync, 'stored').and.returnValue(
      '/aef/list?old=1',
    );
    const harness = await RouterTestingHarness.create('/?v=11&o=a&o=b');
    expect(router.url).toEqual('/aef/list?v=11&o=a&o=b');
    expect(stored).not.toHaveBeenCalled();
    await harness.navigateByUrl('/aef');
    expect(router.url).toEqual('/aef/list');
    expect(stored).not.toHaveBeenCalled();
  });

  it('uses the default list if root has no cached state', async () => {
    spyOn(preferencesStore, 'bypassLanding').and.returnValue(true);
    spyOn(routerSync, 'stored').and.returnValue(undefined);
    await RouterTestingHarness.create('/');
    expect(router.url).toEqual('/aef/list');
  });

  it('preserves an explicit root query with landing enabled without consulting cache', async () => {
    spyOn(preferencesStore, 'bypassLanding').and.returnValue(false);
    const stored = spyOn(routerSync, 'stored').and.returnValue(
      '/aef/list?old=1',
    );
    await RouterTestingHarness.create('/?v=11&o=a&o=b');
    expect(router.url).toEqual('/aef?v=11&o=a&o=b');
    expect(stored).not.toHaveBeenCalled();
  });

  it('should allow navigating to the landing page', async () => {
    await RouterTestingHarness.create('/');
    expect(router.url).toEqual('/aef');
  });
});
