import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { rational } from '~/rational/rational';
import { TestModule } from '~/tests/test-module';

import { createEndfieldState } from '../domain/model';
import { EndfieldCoordinator } from '../state/coordinator';
import { EndfieldElectricCost } from './electric-cost';

describe('EndfieldElectricCost', () => {
  it('applies the independent power weight only when explicitly applied', async () => {
    const state = signal(createEndfieldState());
    const dispatch = jasmine.createSpy('dispatch').and.returnValue(true);
    await TestBed.configureTestingModule({
      imports: [TestModule, EndfieldElectricCost],
      providers: [
        {
          provide: EndfieldCoordinator,
          useValue: { state, ready: signal(true), dispatch },
        },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(EndfieldElectricCost);
    fixture.detectChanges();
    fixture.componentInstance['updateValue'](rational(3, 2));
    fixture.detectChanges();
    expect(dispatch).not.toHaveBeenCalled();
    const buttons = fixture.nativeElement.querySelectorAll(
      'button',
    ) as NodeListOf<HTMLButtonElement>;
    buttons[buttons.length - 1].click();
    expect(
      dispatch.calls.mostRecent().args[0].value.eq(rational(3, 2)),
    ).toBeTrue();
  });
});
