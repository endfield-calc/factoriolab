import { HttpTestingController } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';

import { Migration } from '~/state/router/migration';
import { MockComponent } from '~/tests/mocks/component';
import { TestModule } from '~/tests/test-module';

import { Id } from './id';
import { idGuard } from './id-guard';

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
