import { KeyValue } from '@angular/common';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { rational } from '~/rational/rational';
import { TotalValue } from '~/state/objectives/total-value';
import { SettingsStore } from '~/state/settings/settings-store';
import { ItemId } from '~/tests/item-id';
import { TestModule } from '~/tests/test-module';
import { setInputs } from '~/tests/utils';

import { TotalCell } from './total-cell';

describe('TotalCell', () => {
  let component: TotalCell;
  let fixture: ComponentFixture<TotalCell>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TotalCell],
    }).compileComponents();

    fixture = TestBed.createComponent(TotalCell);
    setInputs(fixture, { value: {} });
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('sortByValue', () => {
    it('should sort KeyValue pairs by their value', () => {
      const a: KeyValue<string, TotalValue> = {
        key: 'key',
        value: { total: rational(2n), iconType: 'item', tooltipType: 'item' },
      };
      const b: KeyValue<string, TotalValue> = {
        key: 'key',
        value: { total: rational(1n), iconType: 'item', tooltipType: 'item' },
      };
      expect(component.sortByValue(a, b)).toEqual(-1);
    });
  });
});

describe('TotalCell machine names', () => {
  it('displays the localized name beside a machine total', async () => {
    await TestBed.configureTestingModule({
      imports: [TestModule, TotalCell],
    }).compileComponents();
    const fixture = TestBed.createComponent(TotalCell);
    setInputs(fixture, {
      value: {
        [ItemId.ElectricMiningDrill]: {
          total: rational(2),
          iconType: 'item',
          tooltipType: 'machine',
        },
      },
    });
    fixture.detectChanges();
    const expectedName =
      TestBed.inject(SettingsStore).dataset().itemRecord[
        ItemId.ElectricMiningDrill
      ].name;
    expect(expectedName).toBeTruthy();
    const machineNames = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll(
        'lab-icon + span',
      ),
      (element) => element.textContent,
    );
    expect(machineNames).toContain(expectedName);
  });
});
