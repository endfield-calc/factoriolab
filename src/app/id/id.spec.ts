import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';

import { RouterSync } from '~/state/router/router-sync';
import { SettingsStore } from '~/state/settings/settings-store';
import { MockComponent } from '~/tests/mocks/component';
import { TestModule } from '~/tests/test-module';

import { Id } from './id';

describe('Endfield workspace route', () => {
  it('forwards the route without applying a matrix mod before migration', async () => {
    TestBed.configureTestingModule({
      imports: [TestModule],
      providers: [
        provideRouter([
          {
            path: 'aef',
            component: Id,
            children: [{ path: 'list', component: MockComponent }],
          },
        ]),
      ],
    });
    const service = TestBed.inject(RouterSync);
    const next = spyOn(service.route$, 'next');
    const apply = spyOn(TestBed.inject(SettingsStore), 'apply');
    await RouterTestingHarness.create('/aef;id=1.1/list?v=11');
    expect(next).toHaveBeenCalled();
    const route = next.calls.mostRecent().args[0];
    expect(route.snapshot.paramMap.get('id')).toBe('1.1');
    expect(apply).not.toHaveBeenCalled();
    TestBed.inject(HttpTestingController).expectNone((request) =>
      /^data\/(?!aef\/)/.test(request.url),
    );
  });
});
