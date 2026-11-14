import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TestModule } from '~/tests/test-module';

import { Main } from './main';

describe('Main', () => {
  let component: Main;
  let fixture: ComponentFixture<Main>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TestModule, Main],
    }).compileComponents();

    fixture = TestBed.createComponent(Main);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('renders both Endfield panels', () => {
    const html = fixture.nativeElement as HTMLElement;
    expect(html.querySelector('lab-endfield-resources')).not.toBeNull();
    expect(html.querySelector('lab-endfield-guide')).not.toBeNull();
  });
});
