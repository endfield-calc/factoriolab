import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ObjectiveType } from '~/models/enum/objective-type';
import { rational } from '~/models/rational';
import { TestModule } from '~/tests';

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
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should hide the empty liquid resource group', () => {
    expect(component.resourceGroups().map((group) => group.id)).toEqual([
      'solid',
      'gas',
    ]);
  });

  it('should supply materials directly when collection devices are ignored', () => {
    component.ready.set(true);
    component.ignoreCollectionDevices.set(true);
    TestBed.flushEffects();

    const objectives = Object.values(component.objectivesSvc.state());
    expect(
      objectives.some(
        (objective) =>
          objective.type === ObjectiveType.ItemSupply &&
          objective.targetId === 'originium_ore',
      ),
    ).toBeTrue();
    expect(
      objectives.some(
        (objective) =>
          objective.type === ObjectiveType.ItemLimit &&
          objective.targetId === 'liquid_water',
      ),
    ).toBeTrue();
    expect(
      objectives.some(
        (objective) =>
          objective.type === ObjectiveType.ItemSupplyUnlimited &&
          objective.targetId === 'liquid_water',
      ),
    ).toBeTrue();
  });

  it('should add custom materials as direct supplies', () => {
    component.ready.set(true);
    component.customInputs.set([{ id: 'coal', num: rational(60n) }]);
    TestBed.flushEffects();

    expect(
      Object.values(component.objectivesSvc.state()).some(
        (objective) =>
          objective.type === ObjectiveType.CustomItemSupply &&
          objective.targetId === 'coal' &&
          objective.value.eq(rational(60n)),
      ),
    ).toBeTrue();
  });
});
