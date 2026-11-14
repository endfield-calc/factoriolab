import { HttpTestingController } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
  CanActivateFn,
  Params,
  provideRouter,
  Router,
  Routes,
} from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';

import { landingGuard } from '~/app/landing/landing-guard';
import { PreferencesStore } from '~/state/preferences/preferences-store';
import { Migration } from '~/state/router/migration';
import { RouterSync } from '~/state/router/router-sync';
import { MockComponent } from '~/tests/mocks/component';
import { TestModule } from '~/tests/test-module';

import { Id } from './id';
import { editorGuard, idGuard } from './id-guard';

describe('Id', () => {
  let component: Id;
  let fixture: ComponentFixture<Id>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TestModule, Id],
    }).compileComponents();

    fixture = TestBed.createComponent(Id);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('setup', () => {
    it('should pass the route to the restore coordinator', () => {
      spyOn(component['routerSvc'].route$, 'next');
      component['setup']();
      expect(component['routerSvc'].route$.next).toHaveBeenCalledWith(
        component['route'],
      );
    });
  });
});

describe('Endfield route navigation', () => {
  function setup(options: { bypass?: boolean; stored?: string } = {}): {
    router: Router;
    source: Routes;
    received: { id: string | undefined; params: Params }[];
    loadEditor: jasmine.Spy;
    bypass: jasmine.Spy;
    stored: jasmine.Spy;
    unzip: jasmine.Spy;
    migrate: jasmine.Spy;
  } {
    const received: { id: string | undefined; params: Params }[] = [];
    const capture: CanActivateFn = (route) => {
      received.push({
        id: route.parent?.params['id'] as string | undefined,
        params: route.queryParams,
      });
      return true;
    };
    const loadEditor = jasmine
      .createSpy('loadEditor')
      .and.resolveTo(MockComponent);
    const source: Routes = [
      {
        path: 'editor',
        canActivate: [editorGuard],
        loadComponent: loadEditor,
        children: [{ path: 'deep', component: MockComponent }],
      },
      {
        path: ':id',
        canActivate: [idGuard],
        children: [
          {
            path: '',
            pathMatch: 'full',
            canActivate: [landingGuard],
            component: MockComponent,
          },
          ...['list', 'wizard', 'flow', 'data'].map((path) => ({
            path,
            canActivate: [capture],
            runGuardsAndResolvers: 'always' as const,
            component: MockComponent,
          })),
        ],
      },
      { path: '**', canActivate: [landingGuard], children: [] },
    ];
    const bypass = jasmine
      .createSpy('bypassLanding')
      .and.returnValue(options.bypass ?? false);
    const stored = jasmine.createSpy('stored').and.returnValue(options.stored);
    const unzip = jasmine
      .createSpy('unzipQueryParams')
      .and.callFake((params: Params) => Promise.resolve(params));
    const migrate = jasmine.createSpy('migrate').and.returnValue({
      modId: 'sfy',
      params: { v: '12', o: ['migrated', 'again'] },
    });
    const hash = jasmine.createSpy('getHashParams').and.resolveTo({});
    TestBed.configureTestingModule({
      providers: [
        provideRouter(source),
        { provide: PreferencesStore, useValue: { bypassLanding: bypass } },
        {
          provide: RouterSync,
          useValue: { stored, unzipQueryParams: unzip, getHashParams: hash },
        },
        { provide: Migration, useValue: { migrate } },
      ],
    });
    return {
      router: TestBed.inject(Router),
      source,
      received,
      loadEditor,
      bypass,
      stored,
      unzip,
      migrate,
    };
  }

  it('passes every shortcut query to the destination unchanged before any old migration', async () => {
    const fixture = setup();
    const harness = await RouterTestingHarness.create('/aef/list?v=11&o=a&o=b');
    expect(fixture.router.url).toBe('/aef/list?v=11&o=a&o=b');
    for (const shortcut of ['list', 'wizard', 'flow', 'data']) {
      await harness.navigateByUrl(`/${shortcut}?v=11&o=a&o=b&cet=x&z=abc`);
      expect(fixture.router.url).toBe(
        `/aef/${shortcut}?v=11&o=a&o=b&cet=x&z=abc`,
      );
      expect(fixture.received.at(-1)).toEqual({
        id: 'aef',
        params: { v: '11', o: ['a', 'b'], cet: 'x', z: 'abc' },
      });
    }
    expect(fixture.unzip).not.toHaveBeenCalled();
    expect(fixture.migrate).not.toHaveBeenCalled();
  });

  it('drops foreign queries and blocks editor and editor deep links', async () => {
    const fixture = setup();
    const harness = await RouterTestingHarness.create('/2x1/list?o=foreign');
    expect(fixture.router.url).toBe('/aef');
    for (const url of [
      '/factorio?o=foreign',
      '/cst/list?o=foreign',
      '/editor?o=foreign',
      '/editor/deep?o=foreign',
    ]) {
      await harness.navigateByUrl(url);
      expect(fixture.router.url).withContext(url).toBe('/aef');
    }
    expect(fixture.loadEditor).not.toHaveBeenCalled();
    expect(fixture.unzip).not.toHaveBeenCalled();
    expect(fixture.migrate).not.toHaveBeenCalled();
  });

  it('preserves a root query with landing enabled without consulting the cache', async () => {
    const fixture = setup({
      stored: '/aef/list?old=1',
    });
    await RouterTestingHarness.create('/?v=11&o=a&o=b');
    expect(fixture.router.url).toBe('/aef?v=11&o=a&o=b');
    expect(fixture.stored).not.toHaveBeenCalled();
  });

  it('resumes only an allowed cache and gives an explicit root query priority', async () => {
    const fixture = setup({
      bypass: true,
      stored: '/aef/list?v=11&o=old',
    });
    const harness = await RouterTestingHarness.create('/');
    expect(fixture.router.url).toBe('/aef/list?v=11&o=old');
    fixture.stored.and.returnValue('/2x1/list?o=foreign');
    await harness.navigateByUrl('/');
    expect(fixture.router.url).toBe('/aef/list');
    fixture.stored.and.returnValue('/aef/list?old=1');
    await harness.navigateByUrl('/?v=11&o=a&o=b');
    expect(fixture.router.url).toBe('/aef/list?v=11&o=a&o=b');
    await harness.navigateByUrl('/aef');
    expect(fixture.router.url).toBe('/aef/list');
    expect(fixture.unzip).not.toHaveBeenCalled();
    expect(fixture.migrate).not.toHaveBeenCalled();
  });
});

describe('Shortcut forwarding to the Endfield codec', () => {
  afterEach(() => {
    localStorage.clear();
  });

  it('passes the activated Id query to native migration', async () => {
    localStorage.clear();
    const migrate = jasmine.createSpy('migrate').and.callFake(() => {
      throw new Error('Stop after observing migration');
    });
    TestBed.configureTestingModule({
      imports: [TestModule],
      providers: [
        { provide: Migration, useValue: { migrate } },
        provideRouter([
          {
            path: ':id',
            component: Id,
            canActivate: [idGuard],
            children: [{ path: 'list', component: MockComponent }],
          },
        ]),
      ],
    });
    const router = TestBed.inject(Router);
    const http = TestBed.inject(HttpTestingController);
    await RouterTestingHarness.create('/list?v=11&o=a&o=b&cet=x');
    for (let i = 0; i < 6; i++) {
      await Promise.resolve();
      TestBed.tick();
    }

    expect(router.url).toBe('/aef/list?v=11&o=a&o=b&cet=x');
    expect(migrate).toHaveBeenCalledOnceWith('aef', {
      v: '11',
      o: ['a', 'b'],
      cet: 'x',
    });
    http.expectNone((request) => /^data\/(?!aef\/)/.test(request.url));
  });
});
