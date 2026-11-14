import { ApplicationRef, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { rational } from '~/rational/rational';
import { Dataset } from '~/state/settings/dataset';
import { ItemId } from '~/tests/item-id';
import { Mocks } from '~/tests/mocks/mocks';
import { RecipeId } from '~/tests/recipe-id';
import { TestModule } from '~/tests/test-module';
import { setInputs } from '~/tests/utils';

import { DetailRow } from './detail-row';

describe('DetailRow', () => {
  let component: DetailRow;
  let fixture: ComponentFixture<DetailRow>;
  let mocks: Mocks;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TestModule, DetailRow],
    }).compileComponents();

    fixture = TestBed.createComponent(DetailRow);
    mocks = TestBed.inject(Mocks);
    setInputs(fixture, {
      value: { itemId: ItemId.ElectronicCircuit, items: rational(360n) },
      leftSpan: 0,
    });
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('shows a detail count only for a visible machine or a producerless showCount recipe', () => {
    const initial = mocks.getDataset();
    const recipeId = initial.recipeIds[0];
    const machineId = initial.machineIds[0];
    const data = signal<Dataset>({
      ...initial,
      recipeRecord: {
        ...initial.recipeRecord,
        [recipeId]: {
          ...initial.recipeRecord[recipeId],
          producers: undefined,
          flags: new Set(),
        },
      },
      machineRecord: {
        ...initial.machineRecord,
        [machineId]: { ...initial.machineRecord[machineId], hideRate: false },
      },
    });
    spyOn<any>(component, 'data').and.callFake(data);
    const countCell = (): string => {
      const cells = (fixture.nativeElement as HTMLElement).querySelectorAll(
        'td',
      );
      return cells[cells.length - 2].textContent.trim();
    };
    setInputs(fixture, { value: { recipeId, machines: rational(777) } });
    expect(countCell()).toBe('');
    setInputs(fixture, {
      value: { recipeId, machineId, machines: rational(777) },
    });
    expect(countCell()).toContain('777');
    data.update((value) => ({
      ...value,
      machineRecord: {
        ...value.machineRecord,
        [machineId]: { ...value.machineRecord[machineId], hideRate: true },
      },
    }));
    fixture.detectChanges();
    expect(countCell()).toBe('');
    data.update((value) => ({
      ...value,
      recipeRecord: {
        ...value.recipeRecord,
        [recipeId]: {
          ...value.recipeRecord[recipeId],
          flags: new Set(['showCount']),
        },
      },
    }));
    fixture.detectChanges();
    expect(countCell()).toBe('');
    setInputs(fixture, { value: { recipeId, machines: rational(777) } });
    expect(countCell()).toContain('777');
  });

  describe('safeFactor', () => {
    it("should ensure we don't divide by zero", () => {
      setInputs(fixture, { factor: rational.zero });
      expect(component['safeFactor']()).toEqual(rational.one);
    });
  });

  describe('inserterId', () => {
    it('should determine the best initial inserterId to use', async () => {
      expect(component['inserterId']()).toEqual(ItemId.FastInserter);
      setInputs(fixture, {
        value: { itemId: ItemId.ElectronicCircuit, items: rational(3600n) },
      });
      await TestBed.inject(ApplicationRef).whenStable();
      expect(component['inserterId']()).toEqual(ItemId.BulkInserter);
    });

    it('should return undefined where inserter is not relevant', () => {
      setInputs(fixture, {
        value: { itemId: ItemId.CrudeOil, items: rational(360n) },
      });
      expect(component['inserterId']()).toBeUndefined();
    });

    it('should ignore quality inserters', async () => {
      const data = mocks.getDataset();
      data.itemRecord[ItemId.FastInserter].quality = {
        id: '1',
        name: '1',
        level: 1,
      };
      spyOn<any>(component, 'data').and.returnValue(data);
      setInputs(fixture, {
        value: { itemId: ItemId.AdvancedCircuit, items: rational(360n) },
        leftSpan: 0,
      });
      await TestBed.inject(ApplicationRef).whenStable();
      expect(component['inserterId']()).toEqual(ItemId.BulkInserter);
    });
  });
});

describe('DetailRow source labels', () => {
  let fixture: ComponentFixture<DetailRow>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TestModule, DetailRow],
    }).compileComponents();

    fixture = TestBed.createComponent(DetailRow);

    setInputs(fixture, {
      value: { itemId: ItemId.ElectronicCircuit, items: rational(360n) },
      leftSpan: 0,
    });
    fixture.detectChanges();
  });
  it('labels derived sources on both icons while retaining ordinary numbering', () => {
    const row = {
      recipeId: RecipeId.ElectronicCircuit,
      recipeObjectiveId: 'ef:resource:iron_ore',
      percent: rational.one,
      destId: RecipeId.AdvancedCircuit,
      destRecipeObjectiveId: 'ef:resource:copper_ore',
      destType: 'recipe' as const,
    };
    setInputs(fixture, { value: row });
    fixture.detectChanges();
    const html: HTMLElement = fixture.nativeElement;
    expect(html.textContent).not.toContain('ef:resource:');
    expect(html.textContent?.match(/endfield\.resources\.source/g)).toHaveSize(
      2,
    );

    setInputs(fixture, {
      value: { ...row, recipeObjectiveId: '42', destRecipeObjectiveId: '51' },
    });
    fixture.detectChanges();
    expect(html.textContent).toContain('#42');
    expect(html.textContent).toContain('51');
    expect(html.textContent).not.toContain('endfield.resources.source');

    setInputs(fixture, { value: { recipeId: RecipeId.ElectronicCircuit } });
    fixture.detectChanges();
    expect(html.textContent).not.toContain('#');
  });
});
