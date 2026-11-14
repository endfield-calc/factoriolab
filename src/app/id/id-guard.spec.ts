import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';

import { MockComponent } from '~/tests/mocks/component';
import { TestModule } from '~/tests/test-module';

import { editorGuard, idGuard } from './id-guard';

describe('idGuard', () => {
  let router: Router;
  let loadEditor: jasmine.Spy;

  beforeEach(() => {
    loadEditor = jasmine.createSpy('loadEditor').and.resolveTo(MockComponent);
    TestBed.configureTestingModule({
      imports: [TestModule],
      providers: [
        provideRouter([
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
              ...['list', 'wizard', 'flow', 'data'].map((path) => ({
                path,
                component: MockComponent,
              })),
              { path: '', pathMatch: 'full', component: MockComponent },
            ],
          },
        ]),
      ],
    });
    router = TestBed.inject(Router);
  });

  it('forwards a shortcut query without performing migration in the guard', async () => {
    await RouterTestingHarness.create('/list?p=coal*0.5&s=**0&v=10');
    expect(router.url).toEqual('/aef/list?p=coal*0.5&s=**0&v=10');
  });

  it('forwards every shortcut with compressed and repeated query parameters unchanged', async () => {
    const harness = await RouterTestingHarness.create('/aef/list');
    for (const shortcut of ['list', 'wizard', 'flow', 'data']) {
      await harness.navigateByUrl(`/${shortcut}?v=11&o=a&o=b&cet=x&z=abc`);
      expect(router.url).toEqual(`/aef/${shortcut}?v=11&o=a&o=b&cet=x&z=abc`);
      const destination = router.routerState.snapshot.root.firstChild;
      expect(destination?.params['id']).toBe('aef');
      expect(destination?.firstChild?.queryParams).toEqual({
        v: '11',
        o: ['a', 'b'],
        cet: 'x',
        z: 'abc',
      });
    }
  });

  it('drops foreign queries and blocks editor and editor deep links', async () => {
    const harness = await RouterTestingHarness.create('/factorio?x=1');
    expect(router.url).toEqual('/aef');
    for (const id of [
      '2x1',
      'final-factory',
      'foundry',
      'outworld-station',
      'satisfactory',
      'techtonica',
      'cst',
      '2x1/list',
      'cst/list',
      'editor',
      'editor/deep',
    ]) {
      await harness.navigateByUrl(`/${id}?x=1`);
      expect(router.url).withContext(id).toEqual('/aef');
    }
    expect(loadEditor).not.toHaveBeenCalled();
  });
});
