import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TestModule } from '~/tests';

import { UserTipsComponent } from './user-tips.component';

describe('UserTipsComponent', () => {
  let component: UserTipsComponent;
  let fixture: ComponentFixture<UserTipsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TestModule, UserTipsComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(UserTipsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
