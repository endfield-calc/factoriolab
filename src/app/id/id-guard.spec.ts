import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';

import { MockComponent } from '~/tests/mocks/component';
import { TestModule } from '~/tests/test-module';

import { idGuard } from './id-guard';

describe('idGuard', () => {
  let router: Router;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [TestModule],
      providers: [
        provideRouter([
          {
            path: ':id',
            canActivate: [idGuard],
            children: [
              { path: 'list', component: MockComponent },
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

  it('forwards compressed and repeated query parameters unchanged', async () => {
    await RouterTestingHarness.create('/list?z=abc&v=10&o=a&o=b');
    expect(router.url).toEqual('/aef/list?z=abc&v=10&o=a&o=b');
  });

  it('redirects foreign datasets and legacy aliases to Endfield', async () => {
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
    ]) {
      await harness.navigateByUrl(`/${id}?x=1`);
      expect(router.url).withContext(id).toEqual('/aef');
    }
  });
});
