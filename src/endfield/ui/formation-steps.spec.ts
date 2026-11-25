import { ApplicationRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { loadModule } from 'glpk-ts';

import rawData from '/public/data/aef/data.json';
import rawHash from '/public/data/aef/hash.json';
import rawTransfer from '/public/data/aef/transfer.json';
import { Icon } from '~/components/icon/icon';
import { Steps } from '~/components/steps/steps';
import { ModData } from '~/data/schema/mod-data';
import { endfieldAdjustmentProvider } from '~/endfield/adapters/calculation-extension';
import { EndfieldTransferData } from '~/endfield/domain/transfer';
import { rational } from '~/rational/rational';
import { ObjectiveType } from '~/state/objectives/objective-type';
import { ObjectiveUnit } from '~/state/objectives/objective-unit';
import { ObjectivesStore } from '~/state/objectives/objectives-store';
import { PreferencesStore } from '~/state/preferences/preferences-store';
import { SettingsStore } from '~/state/settings/settings-store';
import { TestModule } from '~/tests/test-module';
import { Translate } from '~/translate/translate';

describe('formation result display', () => {
  beforeAll(async () => {
    await loadModule('glpk.all.wasm');
  });

  it('shows affected positions and the limitation only for a formation result', async () => {
    TestBed.configureTestingModule({
      imports: [TestModule, Steps],
      providers: [
        endfieldAdjustmentProvider,
        { provide: SettingsStore, useClass: SettingsStore },
      ],
    });
    const data = rawData as unknown as ModData;
    const settings = TestBed.inject(SettingsStore);
    const id = 'formation_magic_ming_item_copper_ming_1';
    settings.apply({
      modId: 'aef',
      locationIds: new Set(['jinlong']),
      excludedRecipeIds: new Set(
        data.recipes
          .filter((recipe) => recipe.id !== id && recipe.out?.['copper_ming'])
          .map((recipe) => recipe.id),
      ),
    });
    settings['modDataResource'].set(data);
    settings['modHashResource'].set(rawHash);
    settings['transferResource'].set(rawTransfer as EndfieldTransferData);
    TestBed.inject(PreferencesStore).apply({ paused: false });
    TestBed.inject(Translate).data.update((translations) => ({
      ...translations,
      'endfield.formation.note': 'ARRAY LIMITATION',
      'endfield.formation.position': 'AFFECTED POSITION',
    }));
    const objectives = TestBed.inject(ObjectivesStore);
    objectives.set({
      1: {
        id: '1',
        targetId: 'copper_ming',
        type: ObjectiveType.Output,
        unit: ObjectiveUnit.Items,
        value: rational(6),
      },
    });
    const fixture = TestBed.createComponent(Steps);
    fixture.detectChanges();
    await TestBed.inject(ApplicationRef).whenStable();
    fixture.detectChanges();
    const text = (): string => fixture.nativeElement.textContent as string;
    expect(text()).toContain('ARRAY LIMITATION');
    expect(text()).toContain('AFFECTED POSITION');
    expect(text()).toContain('L-Cuprium (20%)');
    expect(text()).toContain('L-Array T1');
    const producer = data.recipes.find((recipe) => recipe.id === id)!
      .producers![0];
    const machineIcon = fixture.debugElement
      .queryAll(By.directive(Icon))
      .find(
        (element) => (element.componentInstance as Icon).value() === producer,
      );
    expect(
      machineIcon?.nativeElement.querySelector('[style*="background-image"]'),
    ).toBeTruthy();

    objectives.set({
      1: {
        id: '1',
        targetId: 'iron_ore',
        type: ObjectiveType.Output,
        unit: ObjectiveUnit.Items,
        value: rational(6),
      },
    });
    fixture.detectChanges();
    expect(text()).not.toContain('ARRAY LIMITATION');
    expect(text()).not.toContain('AFFECTED POSITION');
  });
});
