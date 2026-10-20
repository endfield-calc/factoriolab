import { ComponentFixture, TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';

import { TestModule } from '~/tests';

import { MainComponent } from './main.component';

describe('MainComponent', () => {
  let component: MainComponent;
  let fixture: ComponentFixture<MainComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TestModule, MainComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(MainComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('provides a split preview tab and preserves the current plan when switching tabs', async () => {
    const items = await firstValueFrom(component.tabItems$);
    expect(items.map((item) => item.routerLink as string)).toEqual([
      'list',
      'flow',
      'flow-preview',
      'data',
    ]);
    expect(
      items.every((item) => item.queryParamsHandling === 'preserve'),
    ).toBeTrue();
  });
});
