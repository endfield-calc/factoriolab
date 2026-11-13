import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';

import { createEndfieldProduct } from '~/endfield/product/product';
import { PRODUCT_PROFILE } from '~/extensions/product-profile';
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
            path: 'urltree',
            component: MockComponent,
          },
          {
            path: ':id',
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
    spyOn(routerSync, 'stored').and.returnValue('/urltree');
    await RouterTestingHarness.create('/');
    expect(router.url).toEqual('/urltree');
  });

  it('should navigate to the list', async () => {
    spyOn(preferencesStore, 'bypassLanding').and.returnValue(true);
    await RouterTestingHarness.create('/?v=6');
    expect(router.url).toEqual('/2x1/list?v=6');
  });

  it('should allow navigating to the landing page', async () => {
    await RouterTestingHarness.create('/');
    expect(router.url).toEqual('/2x1');
  });
});

describe('landingGuard with product restriction', () => {
  let router: Router;
  let preferences: PreferencesStore;
  let routerSync: RouterSync;
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [TestModule],
      providers: [
        {
          provide: PRODUCT_PROFILE,
          useValue: createEndfieldProduct(false, 'zh'),
        },
        provideRouter([
          {
            path: ':id',
            children: [
              { path: 'list', component: MockComponent },
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
    preferences = TestBed.inject(PreferencesStore);
    routerSync = TestBed.inject(RouterSync);
  });

  it('preserves explicit root queries and ignores cached workspaces', async () => {
    spyOn(preferences, 'bypassLanding').and.returnValue(true);
    spyOn(routerSync, 'stored').and.returnValue('/aef/list?old=1');
    await RouterTestingHarness.create('/?v=11&o=a&o=b&z=abc');
    expect(router.url).toBe('/aef/list?v=11&o=a&o=b&z=abc');
  });

  it('rejects a foreign cached workspace and can resume the allowed one', async () => {
    spyOn(preferences, 'bypassLanding').and.returnValue(true);
    const stored = spyOn(routerSync, 'stored').and.returnValue(
      '/2x1/list?o=foreign',
    );
    const harness = await RouterTestingHarness.create('/');
    expect(router.url).toBe('/aef/list');
    stored.and.returnValue('/aef/list?v=11&o=a');
    await harness.navigateByUrl('/');
    expect(router.url).toBe('/aef/list?v=11&o=a');
  });

  it('retains an explicit root query even when landing is enabled', async () => {
    spyOn(preferences, 'bypassLanding').and.returnValue(false);
    await RouterTestingHarness.create('/?v=11&o=a&o=b');
    expect(router.url).toBe('/aef?v=11&o=a&o=b');
  });
});
