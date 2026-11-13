import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TestModule } from '~/tests/test-module';

import { Id } from './id';

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
