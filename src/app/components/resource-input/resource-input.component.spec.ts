import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AdjustedDataset } from '~/models/dataset';
import { ObjectiveType } from '~/models/enum/objective-type';
import { rational } from '~/models/rational';
import { Mocks, TestModule } from '~/tests';

import { ResourceInputComponent } from './resource-input.component';

describe('ResourceInputComponent', () => {
  let component: ResourceInputComponent;
  let fixture: ComponentFixture<ResourceInputComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TestModule, ResourceInputComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(ResourceInputComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    fixture.detectChanges();
    expect(component).toBeTruthy();
  });

  it('offers only catalog sources and excludes a single destination', () => {
    const dataset = signal<AdjustedDataset>({
      ...Mocks.adjustedDataset,
      locationIds: ['tundra', 'jinlong', 'unavailable'],
      itemEntities: {
        ...Mocks.adjustedDataset.itemEntities,
        domain_key_tundra: {
          id: 'domain_key_tundra',
          name: '',
          category: '__domain_transfer',
          row: 0,
        },
        domain_key_jinlong: {
          id: 'domain_key_jinlong',
          name: '',
          category: '__domain_transfer',
          row: 0,
        },
      },
    });
    const settings = signal({
      ...component.settings(),
      locationIds: new Set(['tundra']),
    });
    component.data = dataset;
    component.settings = settings;
    expect(component.transferSourceOptions()).toEqual(['jinlong']);
    settings.update((old) => ({ ...old, locationIds: new Set() }));
    expect(component.transferSourceOptions()).toEqual([]);
    settings.update((old) => ({ ...old, locationIds: new Set(['unknown']) }));
    expect(component.transferSourceOptions()).toEqual([]);
    settings.update((old) => ({ ...old, locationIds: new Set(['jinlong']) }));
    expect(component.transferSourceOptions()).toEqual(['tundra']);
    settings.update((old) => ({
      ...old,
      locationIds: new Set(['tundra', 'jinlong']),
    }));
    expect(component.transferSourceOptions()).toEqual(['tundra', 'jinlong']);
    dataset.update((old) => {
      const { domain_key_jinlong: _removed, ...itemEntities } =
        old.itemEntities;
      return { ...old, itemEntities };
    });
    expect(component.transferSourceOptions()).toEqual(['tundra']);
  });

  it('writes a transfer objective only while the source is valid', () => {
    component.data = signal({
      ...Mocks.adjustedDataset,
      locationIds: ['tundra', 'jinlong'],
      itemEntities: {
        ...Mocks.adjustedDataset.itemEntities,
        domain_key_tundra: {
          id: 'domain_key_tundra',
          name: '',
          category: '__domain_transfer',
          row: 0,
        },
        domain_key_jinlong: {
          id: 'domain_key_jinlong',
          name: '',
          category: '__domain_transfer',
          row: 0,
        },
      },
    });
    const settings = signal({
      ...component.settings(),
      locationIds: new Set(['tundra']),
    });
    component.settings = settings;
    const add = spyOn(component.objectivesSvc, 'add');
    component.ready.set(true);
    component.enableDomainTransfer.set(true);
    component.transferSource.set('jinlong');
    fixture.detectChanges();
    expect(add).toHaveBeenCalledWith(
      jasmine.objectContaining({
        type: ObjectiveType.DomainTransfer,
        targetId: 'domain_key_jinlong',
      }),
    );
    add.calls.reset();
    settings.update((old) => ({ ...old, locationIds: new Set(['jinlong']) }));
    fixture.detectChanges();
    expect(add).not.toHaveBeenCalled();
    component.transferSource.set('unknown');
    fixture.detectChanges();
    expect(add).not.toHaveBeenCalled();
  });

  it('applies the current per-minute mine totals for both locations', () => {
    component.applyOneKey('tundra');
    expect(component.limitItemsNum()).toEqual({
      originium_ore: rational(560),
      quartz_sand: rational(240),
      iron_ore: rational(1080),
      copper_ore: rational.zero,
      gas_xiranite: rational.zero,
      gas_inert: rational.zero,
    });
    component.applyOneKey('jinlong1.5');
    expect(component.limitItemsNum()).toEqual({
      originium_ore: rational(600),
      quartz_sand: rational.zero,
      iron_ore: rational(120),
      copper_ore: rational(600),
      gas_xiranite: rational(340),
      gas_inert: rational(540),
    });
    expect(component.enableDomainTransfer()).toBeTrue();
    expect(component.transferSource()).toBe('tundra');
    expect(component.limitMachinesNum()['xiranite_oven_1']).toEqual(
      rational(16),
    );
    component.applyOneKeyConfig({
      id: 'load',
      icon: '',
      name: '',
      limitMachines: [{ id: 'xiranite_oven_1', num: rational(12) }],
    });
    expect(component.limitMachinesNum()['xiranite_oven_1']).toEqual(
      rational(12),
    );
  });
});
