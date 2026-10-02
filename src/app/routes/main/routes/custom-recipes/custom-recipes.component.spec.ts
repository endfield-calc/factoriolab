import { signal, WritableSignal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { Observable, of } from 'rxjs';

import {
  CUSTOM_RECIPE_EXAMPLE_FILE_NAME,
  CUSTOM_RECIPE_FORMAT,
  CUSTOM_RECIPE_LIBRARY_FORMAT,
  CUSTOM_RECIPE_VERSION,
  CustomRecipeDocument,
  CustomRecipeLibraryDocument,
  CustomRecipeValidationContext,
} from '~/models/custom-recipe';
import { ContentService } from '~/services/content.service';
import { CustomRecipeService } from '~/services/custom-recipe.service';
import { ExportService } from '~/services/export.service';
import { TranslateService } from '~/services/translate.service';
import { SettingsService } from '~/store/settings.service';

import { CustomRecipesComponent } from './custom-recipes.component';

describe('CustomRecipesComponent global library editing', () => {
  let component: CustomRecipesComponent;
  let fixture: ComponentFixture<CustomRecipesComponent>;
  let service: CustomRecipeService;
  let settings: SettingsService;
  let modId: WritableSignal<string>;
  let saveAsJson: jasmine.Spy<(data: string, name: string) => void>;
  let copiedText: string;
  const confirm =
    jasmine.createSpy<
      (confirmation: {
        header?: string;
        message?: string;
        accept: () => void;
        reject?: () => void;
        acceptLabel?: string;
        rejectLabel?: string;
      }) => void
    >('confirm');
  const context: CustomRecipeValidationContext = {
    modId: 'aef',
    recipeIds: new Set(),
    itemIds: new Set(['input-item', 'output-item']),
    machineIds: new Set(['machine-item', 'thickener_1']),
    categoryIds: new Set(['material', 'product']),
    locationIds: new Set(),
  };

  function document(id = 'first'): CustomRecipeDocument {
    return {
      format: CUSTOM_RECIPE_FORMAT,
      version: CUSTOM_RECIPE_VERSION,
      modId: 'aef',
      recipes: [
        {
          id,
          name: 'Recipe',
          category: 'material',
          row: 999,
          time: '1/2',
          producers: ['machine-item'],
          in: { 'input-item': '1/3' },
          out: { 'output-item': 2 },
          customRecipe: { iconText: 'R' },
        },
      ],
    };
  }

  function draft(): CustomRecipeLibraryDocument {
    return JSON.parse(component.jsonText) as CustomRecipeLibraryDocument;
  }

  async function openRecipeActions(index = 0): Promise<HTMLElement> {
    const buttons = (
      fixture.nativeElement as HTMLElement
    ).querySelectorAll<HTMLButtonElement>('.recipe-menu-trigger');
    buttons[index].click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return window.document.querySelector<HTMLElement>(
      '#custom-recipe-actions_list',
    )!;
  }

  beforeEach(async () => {
    confirm.calls.reset();
    copiedText = '';
    saveAsJson = jasmine.createSpy('saveAsJson');
    modId = signal('aef');
    const enabled = signal(true);
    await TestBed.configureTestingModule({
      imports: [CustomRecipesComponent],
      providers: [
        provideRouter([]),
        provideNoopAnimations(),
        {
          provide: SettingsService,
          useValue: {
            modId,
            customRecipeContext: signal(context),
            customRecipesEnabled: enabled,
            apply: jasmine
              .createSpy('apply')
              .and.callFake((value: { customRecipesEnabled: boolean }) => {
                enabled.set(value.customRecipesEnabled);
              }),
            dataset: signal({
              categoryIds: ['material', 'product'],
              categoryEntities: {
                material: { name: 'Material' },
                product: { name: 'Product' },
              },
              machineIds: ['machine-item'],
              itemIds: [],
              itemEntities: { 'machine-item': { name: 'Machine' } },
              locationIds: [],
              locationEntities: {},
            }),
          },
        },
        { provide: ContentService, useValue: { confirm } },
        { provide: ExportService, useValue: { saveAsJson } },
        {
          provide: TranslateService,
          useValue: {
            get: (
              key: string,
              params?: { fileName?: string },
            ): Observable<string> =>
              of(params?.fileName ? `${key}: ${params.fileName}` : key),
            multi: (keys: string[]): Observable<string[]> => of(keys),
          },
        },
      ],
    }).compileComponents();
    service = TestBed.inject(CustomRecipeService);
    settings = TestBed.inject(SettingsService);
    service.importDocument('one.json', document(), context);
    service.importDocument('two.json', document('second'), context);
    service.setSourceEnabled('aef', 'aef:one.json', false);
    service.setRecipeEnabled('aef', 'aef:two.json', 'second', false);
    fixture = TestBed.createComponent(CustomRecipesComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    await fixture.whenStable();
    spyOnProperty(window, 'isSecureContext', 'get').and.returnValue(false);
    spyOn(window.document, 'execCommand').and.callFake(() => {
      copiedText = (window.document.activeElement as HTMLTextAreaElement).value;
      return true;
    });
  });

  afterEach(() => {
    fixture.destroy();
  });

  it('opens one editor containing all saved files and enablement states', () => {
    component.enterLibraryEditor();
    expect(draft().format).toEqual(CUSTOM_RECIPE_LIBRARY_FORMAT);
    expect(draft().sources.map((source) => source.fileName)).toEqual([
      'one.json',
      'two.json',
    ]);
    expect(draft().sources[0].enabled).toBeFalse();
    expect(draft().sources[1].disabledRecipeIds).toEqual(['second']);
    expect(draft().enabled).toBeTrue();
    expect(component.hasUnsavedChanges).toBeFalse();
  });

  it('asks before switching modes and loads saved data only after discarding form edits', () => {
    const before = localStorage.getItem('customRecipes');
    component.recipes[0].name = '';
    component.onFormChange();
    const issues = component.textIssues();
    component.switchEditorMode('text');
    expect(component.editorMode).toEqual('form');
    expect(component.jsonText).toEqual('');
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(confirm.calls.mostRecent().args[0].acceptLabel).toEqual(
      'customRecipeEditor.discardChanges',
    );
    expect(confirm.calls.mostRecent().args[0].rejectLabel).toEqual(
      'customRecipeEditor.continueEditing',
    );
    confirm.calls.mostRecent().args[0].reject?.();
    expect(component.editorMode).toEqual('form');
    expect(component.recipes[0].name).toEqual('');
    expect(component.textIssues()).toBe(issues);
    expect(component.hasUnsavedChanges).toBeTrue();

    component.switchEditorMode('text');
    confirm.calls.mostRecent().args[0].accept();
    expect(component.editorMode).toEqual('text');
    expect(draft().sources[0].recipes[0].name).toEqual('Recipe');
    expect(draft().sources[0].recipes[0].time).toEqual('1/2');
    expect(draft().sources[0].recipes[0].in['input-item']).toEqual('1/3');
    expect(component.recipes[0].name).toEqual('Recipe');
    expect(component.textIssues()).toEqual([]);
    expect(component.hasUnsavedChanges).toBeFalse();
    expect(localStorage.getItem('customRecipes')).toEqual(before);
    expect(settings.apply).not.toHaveBeenCalled();
  });

  it('switches between clean modes without asking or changing stored data', () => {
    const before = localStorage.getItem('customRecipes');
    component.switchEditorMode('text');
    expect(component.editorMode).toEqual('text');
    const text = component.jsonText;
    component.switchEditorMode('text');
    expect(component.jsonText).toEqual(text);
    component.switchEditorMode('form');
    expect(component.editorMode).toEqual('form');
    expect(confirm).not.toHaveBeenCalled();
    expect(localStorage.getItem('customRecipes')).toEqual(before);
  });

  it('keeps the active mode selected until the user confirms discarding the text draft', async () => {
    component.switchEditorMode('text');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const before = localStorage.getItem('customRecipes');
    component.updateJsonText('{');
    const buttons = (
      fixture.nativeElement as HTMLElement
    ).querySelectorAll<HTMLElement>('.editor-modes .p-button');
    buttons[0].click();
    fixture.detectChanges();
    expect(buttons[1].getAttribute('aria-checked')).toEqual('true');
    expect(buttons[0].getAttribute('aria-checked')).toEqual('false');
    confirm.calls.mostRecent().args[0].reject?.();
    expect(component.editorMode).toEqual('text');
    expect(component.jsonText).toEqual('{');
    expect(component.hasUnsavedChanges).toBeTrue();

    buttons[0].click();
    expect(confirm).toHaveBeenCalledTimes(2);
    confirm.calls.mostRecent().args[0].accept();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(component.editorMode).toEqual('form');
    expect(buttons[0].getAttribute('aria-checked')).toEqual('true');
    expect(buttons[1].getAttribute('aria-checked')).toEqual('false');
    expect(component.jsonText).toEqual('');
    expect(component.hasUnsavedChanges).toBeFalse();
    expect(localStorage.getItem('customRecipes')).toEqual(before);
    expect(settings.apply).not.toHaveBeenCalled();
  });

  it('shows validated text changes in the recipe editor without another discard prompt', () => {
    component.switchEditorMode('text');
    const edited = draft();
    edited.sources[0].recipes[0].name = 'Saved text edit';
    component.updateJsonText(JSON.stringify(edited));
    component.save();
    component.switchEditorMode('form');
    expect(component.recipes[0].name).toEqual('Saved text edit');
    expect(component.hasUnsavedChanges).toBeFalse();
    expect(confirm).not.toHaveBeenCalled();
  });

  it('keeps invalid text and stored data intact when saving or formatting', () => {
    const before = localStorage.getItem('customRecipes');
    component.enterLibraryEditor();
    component.updateJsonText('{');
    component.save();
    component.formatJson();
    expect(component.editorMode).toEqual('text');
    expect(component.jsonText).toEqual('{');
    expect(component.textIssues().length).toBeGreaterThan(0);
    expect(localStorage.getItem('customRecipes')).toEqual(before);
    expect(settings.apply).not.toHaveBeenCalled();
  });

  it('formats syntactically valid JSON without validating or applying invalid recipes', () => {
    const before = localStorage.getItem('customRecipes');
    component.enterLibraryEditor();
    const edited = draft();
    edited.sources[0].recipes[0].time = 'invalid';
    component.updateJsonText(JSON.stringify(edited));
    const validate = spyOn(service, 'validateLibrary').and.callThrough();
    component.formatJson();
    expect(component.jsonText).toEqual(JSON.stringify(edited, null, 2));
    expect(component.textIssues()).toEqual([]);
    expect(validate).not.toHaveBeenCalled();
    expect(component.hasUnsavedChanges).toBeTrue();
    expect(localStorage.getItem('customRecipes')).toEqual(before);
    expect(settings.apply).not.toHaveBeenCalled();

    component.save();
    expect(component.textIssues().length).toBeGreaterThan(0);
    component.download();
    expect(saveAsJson).not.toHaveBeenCalled();
    expect(localStorage.getItem('customRecipes')).toEqual(before);
  });

  it('preserves legacy document shape and unknown fields when formatting', () => {
    component.enterLibraryEditor();
    const legacy = { ...document('legacy'), draftNote: 'Keep this field' };
    component.updateJsonText(JSON.stringify(legacy));
    component.formatJson();
    expect(JSON.parse(component.jsonText)).toEqual(legacy);
    expect(component.jsonText).toEqual(JSON.stringify(legacy, null, 2));
    expect(component.saveResult()).toBeUndefined();
  });

  it('clears obsolete validation feedback after formatting without saving', () => {
    component.enterLibraryEditor();
    const edited = draft();
    component.updateJsonText('{');
    component.save();
    expect(component.textIssues().length).toBeGreaterThan(0);
    component.jsonText = JSON.stringify(edited);
    component.formatJson();
    expect(component.textIssues()).toEqual([]);
    expect(component.saveResult()).toBeUndefined();
  });

  it('saves all edited recipes and switch states together', () => {
    component.enterLibraryEditor();
    const edited = draft();
    edited.enabled = false;
    edited.sources[0].enabled = true;
    edited.sources[0].recipes[0].name = 'First edit';
    edited.sources[1].recipes[0].name = 'Second edit';
    component.updateJsonText(JSON.stringify(edited));
    expect(settings.customRecipesEnabled()).toBeTrue();
    expect(service.sourcesForMod('aef')[0].enabled).toBeFalse();
    component.save();
    expect(settings.apply).toHaveBeenCalledOnceWith({
      customRecipesEnabled: false,
    });
    expect(service.recipesForMod('aef').map((recipe) => recipe.name)).toEqual([
      'First edit',
      'Second edit',
    ]);
    expect(service.sourcesForMod('aef')[0].enabled).toBeTrue();
    expect(service.sourcesForMod('aef')[1].disabledRecipeIds).toEqual([
      'second',
    ]);
    expect(component.saveResult()!.valid).toBeTrue();
    expect(component.hasUnsavedChanges).toBeFalse();
  });

  it('rejects duplicate IDs across the whole draft atomically', () => {
    const before = localStorage.getItem('customRecipes');
    component.enterLibraryEditor();
    const edited = draft();
    edited.sources[1].recipes[0].id = 'first';
    component.updateJsonText(JSON.stringify(edited));
    component.save();
    expect(
      component
        .textIssues()
        .some((issue) => issue.path === 'sources[1].recipes[0].id'),
    ).toBeTrue();
    expect(localStorage.getItem('customRecipes')).toEqual(before);
    expect(settings.apply).not.toHaveBeenCalled();
  });

  it('stages clearing and confirms deletion only when saving', () => {
    const before = localStorage.getItem('customRecipes');
    component.enterLibraryEditor();
    component.clearLibrary();
    expect(draft().sources).toEqual([]);
    expect(confirm).not.toHaveBeenCalled();
    expect(localStorage.getItem('customRecipes')).toEqual(before);
    component.save();
    expect(confirm).toHaveBeenCalled();
    expect(localStorage.getItem('customRecipes')).toEqual(before);
    confirm.calls.mostRecent().args[0].accept();
    expect(service.sourcesForMod('aef')).toEqual([]);
    expect(component.hasUnsavedChanges).toBeFalse();
    expect(component.saveResult()!.valid).toBeTrue();
    component.exitWithoutSaving();
    component.enterLibraryEditor();
    expect(draft().sources).toEqual([]);
  });

  it('restores the disabled default example only after saving', () => {
    const before = localStorage.getItem('customRecipes');
    component.enterLibraryEditor();
    component.resetLibrary();
    expect(draft().sources.length).toEqual(1);
    expect(draft().sources[0].fileName).toEqual(
      CUSTOM_RECIPE_EXAMPLE_FILE_NAME,
    );
    expect(draft().sources[0].enabled).toBeFalse();
    expect(localStorage.getItem('customRecipes')).toEqual(before);
    component.save();
    confirm.calls.mostRecent().args[0].accept();
    expect(service.sourcesForMod('aef').length).toEqual(1);
    expect(service.sourcesForMod('aef')[0].enabled).toBeFalse();
    component.exitWithoutSaving();
    expect(component.selectedSource()!.fileName).toEqual(
      CUSTOM_RECIPE_EXAMPLE_FILE_NAME,
    );
  });

  for (const action of ['resetLibrary', 'clearLibrary'] as const) {
    it(`confirms ${action} before overwriting an unsaved draft and leaves saved data intact`, () => {
      const before = localStorage.getItem('customRecipes');
      component.enterLibraryEditor();
      component.updateJsonText('{');
      component[action]();
      expect(confirm).toHaveBeenCalledTimes(1);
      expect(component.jsonText).toEqual('{');
      expect(localStorage.getItem('customRecipes')).toEqual(before);
      confirm.calls.mostRecent().args[0].accept();
      if (action === 'resetLibrary') {
        expect(draft().sources.length).toEqual(1);
        expect(draft().sources[0].fileName).toEqual(
          CUSTOM_RECIPE_EXAMPLE_FILE_NAME,
        );
        expect(draft().sources[0].enabled).toBeFalse();
      } else {
        expect(draft().sources).toEqual([]);
      }
      expect(component.hasUnsavedChanges).toBeTrue();
      expect(localStorage.getItem('customRecipes')).toEqual(before);
      expect(settings.apply).not.toHaveBeenCalled();
    });

    it(`keeps the draft when ${action} confirmation is cancelled`, () => {
      const before = localStorage.getItem('customRecipes');
      component.enterLibraryEditor();
      component.updateJsonText('{');
      component[action]();
      confirm.calls.mostRecent().args[0].reject?.();
      expect(component.jsonText).toEqual('{');
      expect(component.editorMode).toEqual('text');
      expect(component.hasUnsavedChanges).toBeTrue();
      expect(localStorage.getItem('customRecipes')).toEqual(before);
    });

    it(`does not invoke ${action} outside the global editor`, () => {
      const before = localStorage.getItem('customRecipes');
      component[action]();
      expect(component.jsonText).toEqual('');
      expect(confirm).not.toHaveBeenCalled();
      expect(localStorage.getItem('customRecipes')).toEqual(before);
    });
  }

  it('discards edits, clearing and switch changes on explicit exit without saving', () => {
    const before = localStorage.getItem('customRecipes');
    component.enterLibraryEditor();
    const edited = draft();
    edited.enabled = false;
    edited.sources[0].recipes[0].name = 'Discarded';
    component.updateJsonText(JSON.stringify(edited));
    component.clearLibrary();
    expect(confirm).toHaveBeenCalledTimes(1);
    confirm.calls.mostRecent().args[0].accept();
    component.exitWithoutSaving();
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(component.editorMode).toEqual('form');
    expect(localStorage.getItem('customRecipes')).toEqual(before);
    expect(settings.apply).not.toHaveBeenCalled();
    component.enterLibraryEditor();
    expect(draft().sources.length).toEqual(2);
    expect(draft().enabled).toBeTrue();
  });

  it('keeps the latest saved state when later edits are discarded', () => {
    component.enterLibraryEditor();
    const edited = draft();
    edited.sources[0].recipes[0].name = 'Saved';
    component.updateJsonText(JSON.stringify(edited));
    component.save();
    component.clearLibrary();
    component.exitWithoutSaving();
    expect(component.recipes[0].name).toEqual('Saved');
  });

  it('copies the complete unsaved draft verbatim on HTTP origins', async () => {
    const before = localStorage.getItem('customRecipes');
    component.enterLibraryEditor();
    const edited = draft();
    edited.enabled = false;
    edited.sources[1].recipes[0].name = 'Unsaved';
    component.updateJsonText(JSON.stringify(edited, null, 2));
    await component.copyLibrary();
    expect(copiedText).toEqual(component.jsonText);
    expect(component.copyResult()).toEqual('copied');
    expect(localStorage.getItem('customRecipes')).toEqual(before);
  });

  it('provides selectable complete text when copying is unavailable', async () => {
    (
      window.document.execCommand as jasmine.Spy<
        typeof window.document.execCommand
      >
    ).and.returnValue(false);
    component.enterLibraryEditor();
    await component.copyLibrary();
    expect(component.copyResult()).toEqual('failed');
    expect(component.copyFallbackText()).toEqual(component.jsonText);
  });

  it('accepts old-format pasted JSON as a full library replacement', () => {
    component.enterLibraryEditor();
    component.updateJsonText(JSON.stringify(document('legacy')));
    component.save();
    confirm.calls.mostRecent().args[0].accept();
    expect(service.recipesForMod('aef').map((recipe) => recipe.id)).toEqual([
      'legacy',
    ]);
    expect(draft().format).toEqual(CUSTOM_RECIPE_LIBRARY_FORMAT);
  });

  it('asks before returning normally with unsaved changes', () => {
    component.enterLibraryEditor();
    component.updateJsonText('{');
    component.closeLibraryEditor();
    expect(component.editorMode).toEqual('text');
    expect(component.jsonText).toEqual('{');
    confirm.calls.mostRecent().args[0].accept();
    expect(component.editorMode).toEqual('form');
  });

  it('protects route navigation and respects both confirmation choices', async () => {
    component.enterLibraryEditor();
    component.clearLibrary();
    const rejected = component.canDeactivate();
    confirm.calls.mostRecent().args[0].reject!();
    expect(await rejected).toBeFalse();
    const accepted = component.canDeactivate();
    confirm.calls.mostRecent().args[0].accept();
    expect(await accepted).toBeTrue();
    component.exitWithoutSaving();
    expect(component.canDeactivate()).toBeTrue();
  });

  it('also protects calculator navigation while form edits fail autosave validation', async () => {
    const before = localStorage.getItem('customRecipes');
    component.recipes[0].time = '';
    component.onFormChange();
    const rejected = component.canDeactivate();
    expect(confirm.calls.mostRecent().args[0].acceptLabel).toEqual(
      'customRecipeEditor.discardChanges',
    );
    expect(confirm.calls.mostRecent().args[0].rejectLabel).toEqual(
      'customRecipeEditor.continueEditing',
    );
    confirm.calls.mostRecent().args[0].reject!();
    expect(await rejected).toBeFalse();
    expect(component.recipes[0].time).toEqual('');
    expect(component.editorMode).toEqual('form');
    const accepted = component.canDeactivate();
    confirm.calls.mostRecent().args[0].accept();
    expect(await accepted).toBeTrue();
    expect(localStorage.getItem('customRecipes')).toEqual(before);
    expect(settings.apply).not.toHaveBeenCalled();
  });

  it('protects page reload only while changes are unsaved', () => {
    const preventDefault = jasmine.createSpy('preventDefault');
    const event = {
      preventDefault,
      returnValue: undefined,
    } as unknown as BeforeUnloadEvent;
    component.enterLibraryEditor();
    component.beforeUnload(event);
    expect(preventDefault).not.toHaveBeenCalled();
    component.clearLibrary();
    component.beforeUnload(event);
    expect(preventDefault).toHaveBeenCalled();
  });

  it('loads an exported library file into a draft without saving it', async () => {
    component.enterLibraryEditor();
    const shared = draft();
    shared.sources[0].recipes[0].name = 'Shared';
    component.exitWithoutSaving();
    const file = new File([JSON.stringify(shared)], 'library.json');
    const before = localStorage.getItem('customRecipes');
    await component.importFiles({
      target: { files: [file], value: '' },
    } as unknown as Event);
    expect(component.editorMode).toEqual('text');
    expect(draft().sources[0].recipes[0].name).toEqual('Shared');
    expect(localStorage.getItem('customRecipes')).toEqual(before);
  });

  it('asks only once when loading a library file over an unsaved form draft', async () => {
    component.recipes[0].name = '';
    component.onFormChange();
    const before = localStorage.getItem('customRecipes');
    const library = service.exportLibrary('aef', true);
    library.sources[0].recipes[0].name = 'Loaded';
    const file = new File([JSON.stringify(library)], 'library.json');
    const loading = component.importFiles({
      target: { files: [file], value: '' },
    } as unknown as Event);
    confirm.calls.mostRecent().args[0].accept();
    await loading;
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(component.editorMode).toEqual('text');
    expect(draft().sources[0].recipes[0].name).toEqual('Loaded');
    expect(localStorage.getItem('customRecipes')).toEqual(before);
  });

  it('automatically saves regular form edits only to the selected file', () => {
    component.recipes[0].name = 'Form edit';
    component.onFormChange();
    expect(service.recipesForMod('aef').map((recipe) => recipe.name)).toEqual([
      'Form edit',
      'Recipe',
    ]);
    expect(component.selectedSource()!.enabled).toBeFalse();
    expect(component.hasUnsavedChanges).toBeFalse();
  });

  describe('form autosave', () => {
    it('edits a saved file name in the title row on blur without duplicating the file or losing enablement', () => {
      service.setRecipeEnabled('aef', 'aef:one.json', 'first', false);
      fixture.detectChanges();
      const element = fixture.nativeElement as HTMLElement;
      const input = element.querySelector<HTMLInputElement>(
        '.file-toolbar #custom-recipe-file-name',
      )!;
      expect(input.value).toEqual('one');
      expect(
        element.querySelector('.file-name-extension')!.textContent?.trim(),
      ).toEqual('.json');
      expect(
        element
          .querySelector('.file-name-extension')!
          .hasAttribute('contenteditable'),
      ).toBeFalse();
      expect(
        element.querySelectorAll('#custom-recipe-file-name').length,
      ).toEqual(1);
      const before = localStorage.getItem('customRecipes');
      input.value = 'renamed';
      input.dispatchEvent(new Event('input'));
      expect(localStorage.getItem('customRecipes')).toEqual(before);
      input.dispatchEvent(new Event('blur'));
      expect(
        service.sourcesForMod('aef').map((source) => source.fileName),
      ).toEqual(['renamed.json', 'two.json']);
      expect(component.selectedSourceId()).toEqual('aef:renamed.json');
      expect(component.selectedSource()!.enabled).toBeFalse();
      expect(component.selectedSource()!.disabledRecipeIds).toEqual(['first']);
      expect(component.hasUnsavedChanges).toBeFalse();
      fixture.detectChanges();
      expect(element.querySelector('.source-entry')!.textContent).toContain(
        'renamed.json',
      );
      component.downloadSource(component.selectedSourceId()!);
      expect(saveAsJson.calls.mostRecent().args[1]).toEqual('renamed');
      component.recipes[0].name = 'After rename';
      component.onFormChange();
      expect(component.selectedSource()!.document.recipes[0].name).toEqual(
        'After rename',
      );
      expect(service.sourcesForMod('aef').length).toEqual(2);
    });

    it('commits a file name when Enter blurs its title input', () => {
      const input = (
        fixture.nativeElement as HTMLElement
      ).querySelector<HTMLInputElement>(
        '.file-toolbar #custom-recipe-file-name',
      )!;
      input.focus();
      input.value = 'enter.json';
      input.dispatchEvent(new Event('input'));
      input.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'Enter',
          bubbles: true,
          cancelable: true,
        }),
      );
      expect(component.selectedSource()!.fileName).toEqual('enter.json');
      expect(component.hasUnsavedChanges).toBeFalse();
    });

    for (const name of ['shared.json', 'shared.JSON']) {
      it(`accepts a pasted full name ${name} without duplicating the fixed extension`, () => {
        const input = (
          fixture.nativeElement as HTMLElement
        ).querySelector<HTMLInputElement>('#custom-recipe-file-name')!;
        input.value = name;
        input.dispatchEvent(new Event('input'));
        input.dispatchEvent(new Event('blur'));
        expect(component.fileName).toEqual('shared.json');
        expect(component.fileNameBase).toEqual('shared');
        expect(component.selectedSource()!.fileName).toEqual('shared.json');
        expect(service.sourcesForMod('aef').length).toEqual(2);
      });
    }

    it('keeps the JSON extension when the editable name contains dots or another extension', () => {
      const input = (
        fixture.nativeElement as HTMLElement
      ).querySelector<HTMLInputElement>('#custom-recipe-file-name')!;
      input.value = 'production.v2.txt';
      input.dispatchEvent(new Event('input'));
      input.dispatchEvent(new Event('blur'));
      expect(component.fileName).toEqual('production.v2.txt.json');
      expect(component.fileNameBase).toEqual('production.v2.txt');
      component.downloadSource(component.selectedSourceId()!);
      expect(saveAsJson.calls.mostRecent().args[1]).toEqual(
        'production.v2.txt',
      );
    });

    for (const name of ['', '.json']) {
      it(`rejects an empty base name ${JSON.stringify(name)} and leaves the saved file intact`, () => {
        const before = localStorage.getItem('customRecipes');
        const input = (
          fixture.nativeElement as HTMLElement
        ).querySelector<HTMLInputElement>('#custom-recipe-file-name')!;
        input.value = name;
        input.dispatchEvent(new Event('input'));
        input.dispatchEvent(new Event('blur'));
        expect(
          component.textIssues().some((issue) => issue.path === 'fileName'),
        ).toBeTrue();
        expect(component.selectedSource()!.fileName).toEqual('one.json');
        expect(component.hasUnsavedChanges).toBeTrue();
        expect(localStorage.getItem('customRecipes')).toEqual(before);
      });
    }

    for (const name of ['two.json', '   ']) {
      it(`rejects the file name ${JSON.stringify(name)} without overwriting stored files`, () => {
        const before = localStorage.getItem('customRecipes');
        component.fileName = name;
        component.onFormChange();
        expect(
          component.textIssues().some((issue) => issue.path === 'fileName'),
        ).toBeTrue();
        expect(component.hasUnsavedChanges).toBeTrue();
        expect(component.selectedSourceId()).toEqual('aef:one.json');
        expect(localStorage.getItem('customRecipes')).toEqual(before);
        component.fileName = 'corrected.json';
        component.onFormChange();
        expect(component.selectedSource()!.fileName).toEqual('corrected.json');
        expect(component.hasUnsavedChanges).toBeFalse();
        expect(component.textIssues()).toEqual([]);
      });
    }

    it('keeps a renamed invalid recipe as a draft and renames only after validation succeeds', () => {
      const before = localStorage.getItem('customRecipes');
      component.fileName = 'pending.json';
      component.recipes[0].time = '';
      component.onFormChange();
      expect(localStorage.getItem('customRecipes')).toEqual(before);
      expect(component.selectedSource()!.fileName).toEqual('one.json');
      expect(component.hasUnsavedChanges).toBeTrue();
      component.recipes[0].time = '1/2';
      component.onFormChange();
      expect(component.selectedSource()!.fileName).toEqual('pending.json');
      expect(service.sourcesForMod('aef').length).toEqual(2);
      expect(component.hasUnsavedChanges).toBeFalse();
    });

    it('has no manual save button in form mode but retains it in text mode', () => {
      const element = fixture.nativeElement as HTMLElement;
      expect(element.querySelector('button .fa-floppy-disk')).toBeNull();
      component.enterLibraryEditor();
      fixture.detectChanges();
      expect(element.querySelector('button .fa-floppy-disk')).not.toBeNull();
    });

    it('saves a real text input event without recreating the form object', () => {
      const recipe = component.recipes[0];
      const input = (
        fixture.nativeElement as HTMLElement
      ).querySelector<HTMLInputElement>('#recipe-name')!;
      input.value = 'Typed name';
      input.dispatchEvent(new Event('input'));
      expect(service.recipesForMod('aef')[0].name).toEqual('Typed name');
      expect(component.recipes[0]).toBe(recipe);
      expect(component.hasUnsavedChanges).toBeFalse();
      fixture.detectChanges();
      expect((fixture.nativeElement as HTMLElement).textContent).toContain(
        'customRecipeEditor.autoSaved',
      );
    });

    it('does not rewrite storage merely by opening the page or selecting another file', () => {
      const before = localStorage.getItem('customRecipes');
      const persist = spyOn(service, 'importDocument').and.callThrough();
      component.selectSource('aef:two.json');
      fixture.detectChanges();
      expect(persist).not.toHaveBeenCalled();
      expect(localStorage.getItem('customRecipes')).toEqual(before);
    });

    it('keeps invalid edits as drafts, then saves after they are corrected', () => {
      const before = localStorage.getItem('customRecipes');
      component.recipes[0].time = '';
      component.onFormChange();
      expect(localStorage.getItem('customRecipes')).toEqual(before);
      expect(
        component
          .textIssues()
          .some((issue) => issue.path === 'recipes[0].time'),
      ).toBeTrue();
      expect(component.hasUnsavedChanges).toBeTrue();
      component.recipes[0].time = '3/2';
      component.onFormChange();
      expect(service.recipesForMod('aef')[0].time).toEqual('3/2');
      expect(component.textIssues()).toEqual([]);
      expect(component.hasUnsavedChanges).toBeFalse();
    });

    it('rejects invalid icon values rather than silently replacing them with defaults', () => {
      const before = localStorage.getItem('customRecipes');
      component.recipes[0].customRecipe.iconBackground = '#invalid';
      component.onFormChange();
      expect(localStorage.getItem('customRecipes')).toEqual(before);
      expect(
        component
          .textIssues()
          .some((issue) => issue.path.endsWith('iconBackground')),
      ).toBeTrue();
      component.recipes[0].customRecipe.iconBackground = '#abc';
      component.recipes[0].customRecipe.iconText = '';
      component.onFormChange();
      expect(localStorage.getItem('customRecipes')).toEqual(before);
      expect(
        component.textIssues().some((issue) => issue.path.endsWith('iconText')),
      ).toBeTrue();
    });

    it('rejects cross-file ID conflicts without overwriting any saved file', () => {
      const before = localStorage.getItem('customRecipes');
      component.recipes[0].id = 'second';
      component.onFormChange();
      expect(localStorage.getItem('customRecipes')).toEqual(before);
      expect(
        component.textIssues().some((issue) => issue.path === 'recipes[0].id'),
      ).toBeTrue();
    });

    it('saves preset, producer and color controls automatically', () => {
      component.setTimePreset(component.recipes[0], '10');
      expect(service.recipesForMod('aef')[0].time).toEqual('10');
      component.setProducer(component.recipes[0], 'thickener_1');
      expect(service.recipesForMod('aef')[0].producers).toEqual([
        'thickener_1',
      ]);
      component.setColor(component.recipes[0], {
        target: { value: '#123456' },
      } as unknown as Event);
      expect(
        service.recipesForMod('aef')[0].customRecipe.iconBackground,
      ).toEqual('#123456');
      expect(component.selectedSource()!.enabled).toBeFalse();
    });

    it('does not reset the selected recipe while saving another recipe in the same file', () => {
      const multiple = document();
      multiple.recipes.push({ ...multiple.recipes[0], id: 'third' });
      service.importDocument('one.json', multiple, context);
      component.selectSource('aef:one.json');
      component.selectedRecipeIndex.set(1);
      const recipe = component.selectedRecipe;
      component.selectedRecipe!.name = 'Third edit';
      component.onFormChange();
      expect(component.selectedRecipeIndex()).toEqual(1);
      expect(component.selectedRecipe).toBe(recipe);
      expect(
        service.recipesForMod('aef').find((entry) => entry.id === 'third')!
          .name,
      ).toEqual('Third edit');
      expect(
        service.sourcesForMod('aef').map((source) => source.fileName),
      ).toEqual(['one.json', 'two.json']);
    });

    it('keeps new incomplete recipes out of storage and saves them when valid', () => {
      const before = localStorage.getItem('customRecipes');
      component.addRecipe();
      expect(localStorage.getItem('customRecipes')).toEqual(before);
      expect(component.textIssues().length).toBeGreaterThan(0);
      component.selectedRecipe!.name = 'New recipe';
      component.onFormChange();
      expect(service.sourcesForMod('aef')[0].document.recipes.length).toEqual(
        2,
      );
      expect(component.selectedRecipeIndex()).toEqual(1);
    });

    it('automatically saves deletion, including removing the last recipe', () => {
      component.removeRecipe(0);
      expect(component.selectedSource()!.document.recipes).toEqual([]);
      expect(component.recipes).toEqual([]);
      expect(component.hasUnsavedChanges).toBeFalse();
    });

    it('clears errors when an incomplete new recipe is discarded', () => {
      component.addRecipe();
      expect(component.textIssues().length).toBeGreaterThan(0);
      component.removeRecipe(1);
      expect(component.textIssues()).toEqual([]);
      expect(component.hasUnsavedChanges).toBeFalse();
    });

    it('saves amount changes and deletions without losing the remaining input row', () => {
      component.addAmount(component.recipes[0].inputs);
      component.recipes[0].inputs[1] = { id: 'new-material', amount: '-1' };
      component.onFormChange();
      expect(
        service.recipesForMod('aef')[0].in['new-material'],
      ).toBeUndefined();
      component.recipes[0].inputs[1].amount = '2/3';
      component.onFormChange();
      expect(service.recipesForMod('aef')[0].in['new-material']).toEqual('2/3');
      component.removeAmount(component.recipes[0].inputs, 0);
      expect(service.recipesForMod('aef')[0].in).toEqual({
        'new-material': '2/3',
      });
    });

    it('finishes the new file name on blur before creating its saved source', async () => {
      component.newDocument();
      fixture.detectChanges();
      await fixture.whenStable();
      const input = (
        fixture.nativeElement as HTMLElement
      ).querySelector<HTMLInputElement>('#custom-recipe-file-name')!;
      input.value = 'shared.json';
      input.dispatchEvent(new Event('input'));
      expect(service.sourcesForMod('aef').length).toEqual(2);
      input.dispatchEvent(new Event('blur'));
      expect(component.selectedSource()!.fileName).toEqual('shared.json');
      expect(service.sourcesForMod('aef').length).toEqual(3);
    });

    it('does not autosave global text drafts even if a form change handler is triggered', () => {
      component.enterLibraryEditor();
      const before = localStorage.getItem('customRecipes');
      component.updateJsonText('{');
      component.onFormChange();
      expect(localStorage.getItem('customRecipes')).toEqual(before);
      expect(component.jsonText).toEqual('{');
      expect(component.hasUnsavedChanges).toBeTrue();
    });
  });

  it('keeps mode switching in the header and exposes only the four text tools plus saving', () => {
    const element = fixture.nativeElement as HTMLElement;
    const toolbar = element.querySelector<HTMLElement>('.editor-toolbar')!;
    const modes = toolbar.querySelector('.editor-modes')!;
    expect(element.querySelector('.library-actions')).toBeNull();
    component.enterLibraryEditor();
    fixture.detectChanges();
    const actions = element.querySelector('.library-actions')!;
    const submit = element.querySelector<HTMLButtonElement>('.library-save')!;
    expect(toolbar.querySelector('.editor-modes')).toBe(modes);
    expect(actions.querySelector('.editor-modes')).toBeNull();
    expect(modes.textContent).toContain('customRecipeEditor.formMode');
    expect(modes.textContent).toContain('customRecipeEditor.textMode');
    expect(modes.parentElement).toBe(toolbar);
    expect(
      modes.compareDocumentPosition(actions) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(actions.querySelectorAll('button').length).toEqual(5);
    expect(actions.querySelector('.fa-copy')).toBeNull();
    expect(actions.querySelector('.fa-ellipsis-vertical')).toBeNull();
    expect(actions.querySelector('.fa-trash')).toBeNull();
    expect(actions.contains(submit)).toBeTrue();
    expect(submit.classList.contains('p-button-outlined')).toBeFalse();
    expect(submit.textContent).toContain('customRecipeEditor.saveLibrary');
    expect(
      toolbar.querySelector('button:has(.fa-arrow-left)')!.textContent,
    ).toContain('customRecipeEditor.back');
    expect(actions.querySelector('.fa-arrow-left')).toBeNull();
    expect(toolbar.querySelector('.fa-xmark')).toBeNull();
    expect(element.querySelector('.library-tools')).toBeNull();
    expect(element.querySelector('.library-workspace button')).toBeNull();

    for (const icon of [
      'fa-file-import',
      'fa-download',
      'fa-code',
      'fa-rotate-left',
    ]) {
      const button = actions.querySelector(`.${icon}`)!.closest('button')!;
      expect(
        button.querySelector('.p-button-label')!.textContent?.trim(),
      ).toBeTruthy();
    }
  });

  it('uses the text toolbar to format without saving and to open file importing', () => {
    component.enterLibraryEditor();
    const before = localStorage.getItem('customRecipes');
    const edited = draft();
    component.updateJsonText(JSON.stringify(edited));
    fixture.detectChanges();
    const actions = (fixture.nativeElement as HTMLElement).querySelector(
      '.library-actions',
    )!;
    actions.querySelector<HTMLButtonElement>('button:has(.fa-code)')!.click();
    expect(component.jsonText).toEqual(JSON.stringify(edited, null, 2));
    expect(localStorage.getItem('customRecipes')).toEqual(before);

    const input =
      actions.querySelector<HTMLInputElement>('input[type="file"]')!;
    const click = spyOn(input, 'click');
    actions
      .querySelector<HTMLButtonElement>('button:has(.fa-file-import)')!
      .click();
    expect(click).toHaveBeenCalledTimes(1);
  });

  it('routes the top-left back button to the calculator in both modes', () => {
    const navigate = spyOn(component.router, 'navigate').and.resolveTo(true);
    for (const mode of ['form', 'text'] as const) {
      component.switchEditorMode(mode);
      fixture.detectChanges();
      (fixture.nativeElement as HTMLElement)
        .querySelector<HTMLButtonElement>(
          '.editor-toolbar button:has(.fa-arrow-left)',
        )!
        .click();
      expect(navigate).toHaveBeenCalledWith(['aef', 'list'], {
        queryParamsHandling: 'preserve',
      });
      expect(component.editorMode).toEqual(mode);
    }
    expect(navigate).toHaveBeenCalledTimes(2);
  });

  describe('recipe detail controls', () => {
    it('places collapsed advanced fields last with a persistent caution hint', () => {
      const details = (fixture.nativeElement as HTMLElement).querySelector(
        '.entity-form',
      )!;
      const advanced = details.querySelector('.advanced-editor')!;
      const toggle =
        advanced.querySelector<HTMLButtonElement>('.advanced-toggle')!;
      expect(details.lastElementChild).toBe(advanced);
      expect(advanced.previousElementSibling!.classList).toContain(
        'icon-editor',
      );
      expect(
        advanced.querySelector('.advanced-hint')!.textContent?.trim(),
      ).toEqual('customRecipeEditor.advancedHint');
      expect(toggle.getAttribute('aria-expanded')).toEqual('false');
      expect(advanced.querySelector('.advanced-fields')).toBeNull();

      toggle.click();
      fixture.detectChanges();
      expect(toggle.getAttribute('aria-expanded')).toEqual('true');
      for (const id of [
        'recipe-cost',
        'recipe-usage',
        'recipe-locations',
        'recipe-flags',
      ]) {
        expect(advanced.querySelector(`#${id}`)).not.toBeNull();
      }
      expect(advanced.querySelector('[id^="recipe-catalyst-"]')).toBeNull();
      expect(advanced.querySelector('#recipe-part')).toBeNull();
      expect(advanced.querySelector('#recipe-effects')).toBeNull();

      toggle.click();
      fixture.detectChanges();
      expect(advanced.querySelector('.advanced-fields')).toBeNull();
      expect(advanced.querySelector('.advanced-hint')).not.toBeNull();
    });

    it('preserves hidden advanced data when autosaving and exporting other edits', () => {
      const original = document();
      original.recipes[0].catalyst = { 'output-item': '1/3' };
      original.recipes[0].part = 'output-item';
      original.recipes[0].disallowedEffects = ['productivity'];
      expect(
        service.importDocument('one.json', original, context).valid,
      ).toBeTrue();
      component.selectSource('aef:one.json');
      fixture.detectChanges();
      const recipe = component.selectedRecipe!;
      recipe.name = 'Updated recipe';
      recipe.cost = '3';
      recipe.usage = '25';
      component.onFormChange();
      expect(component.hasUnsavedChanges).toBeFalse();

      const saved = service.sourcesForMod('aef')[0].document.recipes[0];
      expect(saved.name).toEqual('Updated recipe');
      expect(saved.cost).toEqual('3');
      expect(saved.usage).toEqual('25');
      expect(saved.catalyst).toEqual(original.recipes[0].catalyst);
      expect(saved.part).toEqual(original.recipes[0].part);
      expect(saved.disallowedEffects).toEqual(
        original.recipes[0].disallowedEffects,
      );

      component.downloadSource('aef:one.json');
      const exported = JSON.parse(
        saveAsJson.calls.mostRecent().args[0],
      ) as CustomRecipeDocument;
      expect(exported.recipes[0]).toEqual(saved);
      component.enterLibraryEditor();
      expect(draft().sources[0].recipes[0]).toEqual(saved);
    });

    it('shows the name and ID inputs without a duplicate heading or delete button', () => {
      const details = (fixture.nativeElement as HTMLElement).querySelector(
        '.entity-form',
      )!;
      expect(details.querySelectorAll('#recipe-id').length).toEqual(1);
      expect(details.querySelectorAll('#recipe-name').length).toEqual(1);
      expect(details.querySelector('.form-heading')).toBeNull();
      expect(details.querySelector('h3')).toBeNull();
      expect(details.querySelector('.fa-trash')).toBeNull();
      expect(
        (fixture.nativeElement as HTMLElement).querySelector(
          '.recipe-menu-trigger',
        ),
      ).not.toBeNull();
    });

    it('uses matching selection controls on separate rows for category and manufacturing time', async () => {
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();
      const element = fixture.nativeElement as HTMLElement;
      for (const id of ['recipe-category', 'recipe-time-preset']) {
        const control = element.querySelector(`#${id}`)!;
        expect(control.tagName.toLowerCase()).toEqual('p-selectbutton');
        expect(
          control.parentElement!.classList.contains('field-wide'),
        ).toBeTrue();
        expect(
          control.querySelector('.p-selectbutton.recipe-options'),
        ).not.toBeNull();
        expect(
          control.querySelectorAll('[aria-checked="true"]').length,
        ).toEqual(1);
        expect(control.querySelector('.p-highlight')).not.toBeNull();
      }
      expect(element.querySelector('.time-option')).toBeNull();
    });

    it('saves preset selections and does not clear a selected time on a second click', async () => {
      const element = fixture.nativeElement as HTMLElement;
      const recipe = component.selectedRecipe;
      for (const [index, value] of ['1', '2', '10', '20'].entries()) {
        const options = element.querySelectorAll<HTMLElement>(
          '#recipe-time-preset .p-button',
        );
        options[index].click();
        fixture.detectChanges();
        await fixture.whenStable();
        fixture.detectChanges();
        expect(component.selectedRecipe).toBe(recipe);
        expect(component.selectedRecipe!.timePreset).toEqual(value);
        expect(service.recipesForMod('aef')[0].time).toEqual(value);
        expect(component.hasUnsavedChanges).toBeFalse();
        expect(element.querySelector('input#recipe-time')).toBeNull();
        const selected = element.querySelectorAll<HTMLElement>(
          '#recipe-time-preset .p-button',
        )[index];
        expect(selected.getAttribute('aria-checked')).toEqual('true');
        const before = localStorage.getItem('customRecipes');
        selected.click();
        expect(component.selectedRecipe!.timePreset).toEqual(value);
        expect(localStorage.getItem('customRecipes')).toEqual(before);
      }
    });

    it('keeps custom time values editable and autosaves fractions after switching presets', async () => {
      const element = fixture.nativeElement as HTMLElement;
      expect(
        element.querySelector<HTMLInputElement>('#recipe-time')!.value,
      ).toEqual('1/2');
      element
        .querySelectorAll<HTMLElement>('#recipe-time-preset .p-button')[1]
        .click();
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();
      element
        .querySelectorAll<HTMLElement>('#recipe-time-preset .p-button')[4]
        .click();
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();
      const input = element.querySelector<HTMLInputElement>('#recipe-time')!;
      expect(input.value).toEqual('2');
      input.value = '3/2';
      input.dispatchEvent(new Event('input'));
      expect(component.selectedRecipe!.timePreset).toEqual('custom');
      expect(service.recipesForMod('aef')[0].time).toEqual('3/2');
      expect(component.hasUnsavedChanges).toBeFalse();
    });

    it('autosaves category selections without deselecting the current category', async () => {
      const element = fixture.nativeElement as HTMLElement;
      element
        .querySelectorAll<HTMLElement>('#recipe-category .p-button')[1]
        .click();
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();
      expect(component.selectedRecipe!.category).toEqual('product');
      expect(service.recipesForMod('aef')[0].category).toEqual('product');
      expect(component.hasUnsavedChanges).toBeFalse();
      const selected = element.querySelectorAll<HTMLElement>(
        '#recipe-category .p-button',
      )[1];
      expect(selected.getAttribute('aria-checked')).toEqual('true');
      selected.click();
      expect(component.selectedRecipe!.category).toEqual('product');
    });
  });

  describe('file list and downloads', () => {
    it('orders file columns as enablement, download, count, delete, star and name', () => {
      const element = fixture.nativeElement as HTMLElement;
      expect(
        Array.from(element.querySelectorAll('.source-table th')).map((header) =>
          header.textContent?.trim(),
        ),
      ).toEqual([
        'customRecipeEditor.enableFile',
        'customRecipeEditor.downloadAction',
        'customRecipeEditor.recipeCount',
        'customRecipeEditor.removeAction',
        'customRecipeEditor.starAction',
        'customRecipeEditor.fileName',
      ]);
      const cells = element.querySelectorAll('.source-row:first-child td');
      expect(cells[0].querySelector('p-checkbox')).not.toBeNull();
      expect(cells[1].querySelector('.source-download')).not.toBeNull();
      expect(cells[2].classList.contains('source-count')).toBeTrue();
      expect(cells[3].querySelector('.source-remove')).not.toBeNull();
      expect(cells[4].querySelector('.source-star')).not.toBeNull();
      expect(cells[4].querySelector('.source-entry')).toBeNull();
      expect(cells[5].querySelector('.source-entry')).not.toBeNull();
      expect(cells[5].querySelector('.source-star')).toBeNull();
    });

    it('places the file list before and outside the form workspace', () => {
      const element = fixture.nativeElement as HTMLElement;
      const files = element.querySelector('.source-pane')!;
      const workspace = element.querySelector('.workspace-pane')!;
      expect(files.parentElement).toBe(workspace.parentElement);
      expect(
        files.compareDocumentPosition(workspace) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      expect(files.querySelectorAll('.source-row').length).toEqual(2);
      expect(element.querySelector('.editor-toolbar .fa-download')).toBeNull();
    });

    it('downloads an unselected file using its own file name and saved recipes', () => {
      const element = fixture.nativeElement as HTMLElement;
      const button =
        element.querySelectorAll<HTMLButtonElement>('.source-download')[1];
      const before = localStorage.getItem('customRecipes');
      button.click();
      expect(saveAsJson).toHaveBeenCalledTimes(1);
      const [text, name] = saveAsJson.calls.mostRecent().args;
      expect(name).toEqual('two');
      expect(
        (JSON.parse(text) as CustomRecipeDocument).recipes.map(
          (recipe) => recipe.id,
        ),
      ).toEqual(['second']);
      expect(component.selectedSourceId()).toEqual('aef:one.json');
      expect(localStorage.getItem('customRecipes')).toEqual(before);
    });

    it('downloads saved files even while the current form has invalid unsaved changes', () => {
      component.recipes[0].name = '';
      component.onFormChange();
      const issues = component.textIssues();
      component.downloadSource('aef:one.json');
      expect(
        (
          JSON.parse(
            saveAsJson.calls.mostRecent().args[0],
          ) as CustomRecipeDocument
        ).recipes[0].name,
      ).toEqual('Recipe');
      component.downloadSource('aef:two.json');
      expect(
        (
          JSON.parse(
            saveAsJson.calls.mostRecent().args[0],
          ) as CustomRecipeDocument
        ).recipes[0].id,
      ).toEqual('second');
      expect(component.recipes[0].name).toEqual('');
      expect(component.textIssues()).toBe(issues);
      expect(component.hasUnsavedChanges).toBeTrue();
    });

    it('lets each file be enabled independently without selecting it', () => {
      component.setSourceEnabled('aef:two.json', false);
      expect(service.sourcesForMod('aef')[0].enabled).toBeFalse();
      expect(service.sourcesForMod('aef')[1].enabled).toBeFalse();
      component.setSourceEnabled('aef:one.json', true);
      expect(service.sourcesForMod('aef')[0].enabled).toBeTrue();
      expect(service.sourcesForMod('aef')[1].enabled).toBeFalse();
      expect(component.selectedSourceId()).toEqual('aef:one.json');
    });

    it('keeps whole-library export in the global editor and includes its unsaved draft', () => {
      component.enterLibraryEditor();
      const edited = draft();
      edited.sources[1].recipes[0].name = 'Unsaved export';
      component.updateJsonText(JSON.stringify(edited));
      fixture.detectChanges();
      (fixture.nativeElement as HTMLElement)
        .querySelector<HTMLButtonElement>(
          '.library-actions button:has(.fa-download)',
        )!
        .click();
      const [text, name] = saveAsJson.calls.mostRecent().args;
      const exported = JSON.parse(text) as CustomRecipeLibraryDocument;
      expect(name).toEqual('custom-recipe-library');
      expect(exported.sources.length).toEqual(2);
      expect(exported.sources[1].recipes[0].name).toEqual('Unsaved export');
      expect(service.recipesForMod('aef')[1].name).toEqual('Recipe');
    });

    it('does not download missing files or invoke global export from the form', () => {
      component.downloadSource('missing');
      component.download();
      expect(saveAsJson).not.toHaveBeenCalled();
    });
  });

  describe('file starring', () => {
    function fileNames(): string[] {
      fixture.detectChanges();
      return Array.from(
        (fixture.nativeElement as HTMLElement).querySelectorAll(
          '.source-entry span',
        ),
      ).map((name) => name.textContent!.trim());
    }

    it('pins an unselected file from its star button and restores the original order when unstarred', () => {
      const element = fixture.nativeElement as HTMLElement;
      const button =
        element.querySelectorAll<HTMLButtonElement>('.source-star')[1];
      expect(button.getAttribute('aria-label')).toContain('two.json');
      expect(button.getAttribute('aria-pressed')).toEqual('false');
      expect(button.querySelector('.fa-regular.fa-star')).not.toBeNull();
      const selectedRecipe = component.selectedRecipe;
      button.click();
      expect(fileNames()).toEqual(['two.json', 'one.json']);
      expect(button.getAttribute('aria-pressed')).toEqual('true');
      expect(button.querySelector('.fa-solid.fa-star')).not.toBeNull();
      expect(component.sources().map((source) => source.fileName)).toEqual([
        'one.json',
        'two.json',
      ]);
      expect(component.sources()[1].starred).toBeTrue();
      expect(component.selectedSourceId()).toEqual('aef:one.json');
      expect(component.selectedRecipe).toBe(selectedRecipe);
      expect(component.sources()[0].enabled).toBeFalse();
      expect(component.sources()[1].disabledRecipeIds).toEqual(['second']);
      expect(component.hasUnsavedChanges).toBeFalse();
      expect(confirm).not.toHaveBeenCalled();
      button.click();
      expect(fileNames()).toEqual(['one.json', 'two.json']);
      expect(button.getAttribute('aria-pressed')).toEqual('false');
    });

    it('preserves original relative order within the starred and unstarred groups', () => {
      service.importDocument('three.json', document('third'), context);
      service.importDocument('four.json', document('fourth'), context);
      component.setSourceStarred('aef:four.json', true);
      component.setSourceStarred('aef:two.json', true);
      expect(fileNames()).toEqual([
        'two.json',
        'four.json',
        'one.json',
        'three.json',
      ]);
      component.setSourceStarred('aef:three.json', true);
      expect(fileNames()).toEqual([
        'two.json',
        'three.json',
        'four.json',
        'one.json',
      ]);
      component.setSourceStarred('aef:two.json', false);
      expect(fileNames()).toEqual([
        'three.json',
        'four.json',
        'one.json',
        'two.json',
      ]);
      expect(service.recipesForMod('aef').map((recipe) => recipe.id)).toEqual([
        'first',
        'second',
        'third',
        'fourth',
      ]);
    });

    it('keeps invalid edits and their errors while starring selected or unselected files', () => {
      component.recipes[0].name = '';
      component.onFormChange();
      const recipes = component.recipes;
      const issues = component.textIssues();
      component.setSourceStarred('aef:two.json', true);
      component.setSourceStarred('aef:one.json', true);
      expect(component.selectedSourceId()).toEqual('aef:one.json');
      expect(component.recipes).toBe(recipes);
      expect(component.recipes[0].name).toEqual('');
      expect(component.textIssues()).toBe(issues);
      expect(component.hasUnsavedChanges).toBeTrue();
      expect(component.sources().every((source) => source.starred)).toBeTrue();
      expect(confirm).not.toHaveBeenCalled();
    });

    it('keeps stars and pinning after renaming or automatically saving a file', () => {
      component.setSourceStarred('aef:two.json', true);
      component.selectSource('aef:two.json');
      component.setFileNameBase('renamed');
      expect(fileNames()).toEqual(['renamed.json', 'one.json']);
      expect(component.selectedSourceId()).toEqual('aef:renamed.json');
      expect(component.selectedSource()!.starred).toBeTrue();
      component.recipes[0].name = 'Edited';
      component.onFormChange();
      expect(component.selectedSource()!.starred).toBeTrue();
      expect(fileNames()).toEqual(['renamed.json', 'one.json']);
      expect(component.hasUnsavedChanges).toBeFalse();
    });

    it('round-trips star state in the global text editor and applies text changes only after saving', () => {
      component.setSourceStarred('aef:two.json', true);
      component.enterLibraryEditor();
      const edited = draft();
      expect(edited.sources[1].starred).toBeTrue();
      edited.sources[0].starred = true;
      edited.sources[1].starred = false;
      component.updateJsonText(JSON.stringify(edited));
      expect(component.sources()[0].starred).toBeFalse();
      expect(component.sources()[1].starred).toBeTrue();
      component.download();
      const exported = JSON.parse(
        saveAsJson.calls.mostRecent().args[0],
      ) as CustomRecipeLibraryDocument;
      expect(exported.sources.map((source) => source.starred)).toEqual([
        true,
        false,
      ]);
      component.save();
      component.switchEditorMode('form');
      expect(component.sources().map((source) => source.starred)).toEqual([
        true,
        false,
      ]);
      expect(fileNames()).toEqual(['one.json', 'two.json']);
      expect(component.hasUnsavedChanges).toBeFalse();
      expect(confirm).not.toHaveBeenCalled();
    });

    it('keeps row downloads, enablement and deletion tied to their file after pinning', () => {
      component.setSourceStarred('aef:two.json', true);
      fixture.detectChanges();
      const row = (fixture.nativeElement as HTMLElement).querySelector(
        '.source-row',
      )!;
      expect(
        row.querySelector('.source-entry span')!.textContent!.trim(),
      ).toEqual('two.json');
      row.querySelector<HTMLButtonElement>('.source-download')!.click();
      expect(saveAsJson.calls.mostRecent().args[1]).toEqual('two');
      component.setSourceEnabled('aef:two.json', false);
      expect(component.sources()[1].starred).toBeTrue();
      row.querySelector<HTMLButtonElement>('.source-remove')!.click();
      expect(confirm.calls.mostRecent().args[0].header).toContain('two.json');
      confirm.calls.mostRecent().args[0].accept();
      expect(fileNames()).toEqual(['one.json']);
      expect(component.selectedSourceId()).toEqual('aef:one.json');
    });

    it('allows starring files when custom recipe calculations are disabled', () => {
      component.setCustomRecipesEnabled(false);
      fixture.detectChanges();
      const button = (
        fixture.nativeElement as HTMLElement
      ).querySelectorAll<HTMLButtonElement>('.source-star')[1];
      expect(button.disabled).toBeFalse();
      button.click();
      expect(fileNames()).toEqual(['two.json', 'one.json']);
      expect(component.customRecipesEnabled()).toBeFalse();
      expect(component.sources()[1].starred).toBeTrue();
    });
  });

  describe('file deletion', () => {
    it('always asks before deleting a saved file from its table row', () => {
      const before = localStorage.getItem('customRecipes');
      const button = (
        fixture.nativeElement as HTMLElement
      ).querySelector<HTMLButtonElement>('.source-remove')!;
      expect(button.getAttribute('aria-label')).toContain('one.json');
      button.click();
      expect(confirm).toHaveBeenCalledTimes(1);
      const confirmation = confirm.calls.mostRecent().args[0];
      expect(confirmation.header).toContain('one.json');
      expect(confirmation.message).toEqual(
        'customRecipeEditor.removeFileWarning',
      );
      expect(confirmation.acceptLabel).toEqual(
        'customRecipeEditor.removeAction',
      );
      expect(confirmation.rejectLabel).toEqual('cancel');
      expect(localStorage.getItem('customRecipes')).toEqual(before);
      expect(component.selectedSourceId()).toEqual('aef:one.json');

      confirmation.accept();
      expect(component.sources().map((source) => source.fileName)).toEqual([
        'two.json',
      ]);
      expect(service.recipesForMod('aef').map((recipe) => recipe.id)).toEqual([
        'second',
      ]);
      expect(component.selectedSourceId()).toBeNull();
      expect(component.recipes).toEqual([]);
      expect(component.hasUnsavedChanges).toBeFalse();
    });

    it('keeps the file, selection and invalid draft when deletion is cancelled', () => {
      component.recipes[0].name = '';
      component.onFormChange();
      const before = localStorage.getItem('customRecipes');
      const recipes = component.recipes;
      const issues = component.textIssues();
      component.removeSource('aef:one.json');
      const confirmation = confirm.calls.mostRecent().args[0];
      expect(confirmation.message).toEqual(
        'customRecipeEditor.removeUnsavedFileWarning',
      );
      confirmation.reject?.();
      expect(localStorage.getItem('customRecipes')).toEqual(before);
      expect(component.selectedSourceId()).toEqual('aef:one.json');
      expect(component.recipes).toBe(recipes);
      expect(component.recipes[0].name).toEqual('');
      expect(component.textIssues()).toBe(issues);
      expect(component.hasUnsavedChanges).toBeTrue();
    });

    it('discards only the deleted selected file draft after explicit acceptance', () => {
      component.recipes[0].name = '';
      component.onFormChange();
      const otherSource = component.sources()[1];
      component.removeSource('aef:one.json');
      expect(component.recipes[0].name).toEqual('');
      confirm.calls.mostRecent().args[0].accept();
      expect(component.sources()).toEqual([otherSource]);
      expect(component.selectedSourceId()).toBeNull();
      expect(component.recipes).toEqual([]);
      expect(component.textIssues()).toEqual([]);
      expect(component.hasUnsavedChanges).toBeFalse();
      component.onFormChange();
      expect(component.sources()).toEqual([otherSource]);
    });

    it('deletes an unselected file without touching the current invalid draft', () => {
      component.recipes[0].name = '';
      component.onFormChange();
      const recipes = component.recipes;
      const issues = component.textIssues();
      const selectedSource = component.selectedSource();
      const button = (
        fixture.nativeElement as HTMLElement
      ).querySelectorAll<HTMLButtonElement>('.source-remove')[1];
      button.click();
      const confirmation = confirm.calls.mostRecent().args[0];
      expect(confirmation.header).toContain('two.json');
      expect(confirmation.message).toEqual(
        'customRecipeEditor.removeFileWarning',
      );
      confirmation.accept();
      expect(component.sources()).toEqual([selectedSource!]);
      expect(component.selectedSourceId()).toEqual('aef:one.json');
      expect(component.recipes).toBe(recipes);
      expect(component.recipes[0].name).toEqual('');
      expect(component.textIssues()).toBe(issues);
      expect(component.hasUnsavedChanges).toBeTrue();
    });

    it('deletes the confirmed target even if the selected file changes', () => {
      component.removeSource('aef:one.json');
      const confirmation = confirm.calls.mostRecent().args[0];
      component.selectSource('aef:two.json');
      const recipes = component.recipes;
      confirmation.accept();
      expect(component.sources().map((source) => source.fileName)).toEqual([
        'two.json',
      ]);
      expect(component.selectedSourceId()).toEqual('aef:two.json');
      expect(component.recipes).toBe(recipes);
      expect(component.recipes[0].id).toEqual('second');
      expect(component.hasUnsavedChanges).toBeFalse();
    });

    it('does nothing for missing files or a target removed while confirming', () => {
      const before = localStorage.getItem('customRecipes');
      component.removeSource('missing');
      expect(confirm).not.toHaveBeenCalled();
      expect(localStorage.getItem('customRecipes')).toEqual(before);

      component.recipes[0].name = '';
      component.onFormChange();
      component.removeSource('aef:one.json');
      service.removeSource('aef', 'aef:one.json');
      const afterRemoval = localStorage.getItem('customRecipes');
      confirm.calls.mostRecent().args[0].accept();
      expect(localStorage.getItem('customRecipes')).toEqual(afterRemoval);
      expect(component.selectedSourceId()).toEqual('aef:one.json');
      expect(component.recipes[0].name).toEqual('');
      expect(component.hasUnsavedChanges).toBeTrue();
    });

    it('does not apply a deletion confirmation after changing mods', () => {
      component.removeSource('aef:one.json');
      const before = localStorage.getItem('customRecipes');
      modId.set('other-mod');
      confirm.calls.mostRecent().args[0].accept();
      expect(localStorage.getItem('customRecipes')).toEqual(before);
      expect(service.sourcesForMod('aef').length).toEqual(2);
    });

    it('shows a six-column empty state after confirming deletion of every file', () => {
      component.removeSource('aef:one.json');
      confirm.calls.mostRecent().args[0].accept();
      component.removeSource('aef:two.json');
      confirm.calls.mostRecent().args[0].accept();
      fixture.detectChanges();
      const element = fixture.nativeElement as HTMLElement;
      expect(element.querySelectorAll('.source-row').length).toEqual(0);
      expect(
        element
          .querySelector('.source-table .empty-copy')
          ?.getAttribute('colspan'),
      ).toEqual('6');
      expect(component.recipes).toEqual([]);
      expect(component.hasUnsavedChanges).toBeFalse();
    });

    it('offers only recipe deletion in the lower editing workspace', async () => {
      const element = fixture.nativeElement as HTMLElement;
      expect(element.querySelector('.workspace-pane .file-remove')).toBeNull();
      expect(element.querySelector('.file-toolbar .fa-trash')).toBeNull();
      expect(element.querySelector('.form-heading .fa-trash')).toBeNull();
      const menu = await openRecipeActions();
      menu.querySelector<HTMLAnchorElement>('.p-menuitem-link')!.click();
      expect(component.sources().length).toEqual(2);
      expect(component.selectedSourceId()).toEqual('aef:one.json');
      expect(component.selectedSource()!.document.recipes).toEqual([]);
      expect(confirm).not.toHaveBeenCalled();
    });
  });

  describe('recipe list actions', () => {
    function loadMultipleRecipes(): void {
      const multiple = document();
      multiple.recipes.push(
        { ...multiple.recipes[0], id: 'third', name: 'Third' },
        { ...multiple.recipes[0], id: 'fourth', name: 'Fourth' },
      );
      service.importDocument('one.json', multiple, context);
      component.selectSource('aef:one.json');
      fixture.detectChanges();
    }

    it('places enablement first and the menu button last in every recipe row', () => {
      loadMultipleRecipes();
      const rows = (fixture.nativeElement as HTMLElement).querySelectorAll(
        '.entity-row',
      );
      expect(rows.length).toEqual(3);
      for (const row of Array.from(rows)) {
        expect(row.children[0].tagName).toEqual('P-CHECKBOX');
        expect(row.children[1].classList.contains('entity-entry')).toBeTrue();
        expect(
          row.children[2].classList.contains('recipe-menu-trigger'),
        ).toBeTrue();
        expect(row.querySelector('.fa-ellipsis')).not.toBeNull();
        expect(row.querySelector('.fa-trash')).toBeNull();
        expect(row.children[2].getAttribute('aria-haspopup')).toEqual('menu');
      }
    });

    it('opens only a delete menu and deletes its own unselected recipe', async () => {
      loadMultipleRecipes();
      const selected = component.selectedRecipe;
      const before = localStorage.getItem('customRecipes');
      const menu = await openRecipeActions(1);
      expect(menu.querySelectorAll('[role="menuitem"]').length).toEqual(1);
      expect(
        menu.querySelector('.p-menuitem-text')?.textContent?.trim(),
      ).toEqual('customRecipeEditor.removeAction');
      expect(menu.querySelector('.fa-trash')).not.toBeNull();
      expect(component.selectedRecipe).toBe(selected);
      expect(localStorage.getItem('customRecipes')).toEqual(before);
      expect(
        (fixture.nativeElement as HTMLElement)
          .querySelectorAll('.recipe-menu-trigger')[1]
          .getAttribute('aria-expanded'),
      ).toEqual('true');
      menu.querySelector<HTMLAnchorElement>('.p-menuitem-link')!.click();
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();
      expect(component.recipes.map((recipe) => recipe.id)).toEqual([
        'first',
        'fourth',
      ]);
      expect(
        component.selectedSource()!.document.recipes.map((recipe) => recipe.id),
      ).toEqual(['first', 'fourth']);
      expect(component.selectedRecipe).toBe(selected);
      expect(component.selectedRecipeIndex()).toEqual(0);
      expect(component.sources().length).toEqual(2);
      expect(component.hasUnsavedChanges).toBeFalse();
      expect(
        window.document.querySelector('#custom-recipe-actions_list'),
      ).toBeNull();
    });

    it('retargets an open menu to another recipe without changing selection', async () => {
      loadMultipleRecipes();
      await openRecipeActions(0);
      const menu = await openRecipeActions(2);
      expect(menu).not.toBeNull();
      const buttons = (fixture.nativeElement as HTMLElement).querySelectorAll(
        '.recipe-menu-trigger',
      );
      expect(buttons[0].getAttribute('aria-expanded')).toEqual('false');
      expect(buttons[2].getAttribute('aria-expanded')).toEqual('true');
      menu.querySelector<HTMLAnchorElement>('.p-menuitem-link')!.click();
      expect(component.recipes.map((recipe) => recipe.id)).toEqual([
        'first',
        'third',
      ]);
      expect(component.selectedRecipeIndex()).toEqual(0);
    });

    it('closes the menu on a second click or Escape without deleting data', async () => {
      const before = localStorage.getItem('customRecipes');
      await openRecipeActions();
      await openRecipeActions();
      expect(
        window.document.querySelector('#custom-recipe-actions_list'),
      ).toBeNull();
      const menu = await openRecipeActions();
      menu.dispatchEvent(
        new KeyboardEvent('keydown', {
          code: 'Escape',
          key: 'Escape',
          bubbles: true,
        }),
      );
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();
      expect(
        window.document.querySelector('#custom-recipe-actions_list'),
      ).toBeNull();
      expect(localStorage.getItem('customRecipes')).toEqual(before);
      expect(component.recipes.length).toEqual(1);
    });

    it('keeps the selected recipe when removing a recipe before or after it', () => {
      loadMultipleRecipes();
      component.selectedRecipeIndex.set(1);
      const selected = component.selectedRecipe;
      component.removeRecipe(0);
      expect(component.selectedRecipe).toBe(selected);
      expect(component.selectedRecipeIndex()).toEqual(0);
      component.removeRecipe(1);
      expect(component.selectedRecipe).toBe(selected);
      expect(component.selectedRecipeIndex()).toEqual(0);
      expect(
        component.selectedSource()!.document.recipes.map((recipe) => recipe.id),
      ).toEqual(['third']);
    });

    it('selects the preceding recipe when deleting the selected last recipe', async () => {
      loadMultipleRecipes();
      component.selectedRecipeIndex.set(2);
      const menu = await openRecipeActions(2);
      menu.querySelector<HTMLAnchorElement>('.p-menuitem-link')!.click();
      expect(component.selectedRecipeIndex()).toEqual(1);
      expect(component.selectedRecipe!.id).toEqual('third');
      expect(component.hasUnsavedChanges).toBeFalse();
    });

    it('does not delete another file recipe when an old menu command is used', async () => {
      await openRecipeActions();
      component.selectSource('aef:two.json');
      const before = localStorage.getItem('customRecipes');
      component.recipeMenuItems[0].command!({});
      expect(localStorage.getItem('customRecipes')).toEqual(before);
      expect(component.selectedSourceId()).toEqual('aef:two.json');
      expect(component.recipes[0].id).toEqual('second');
    });

    it('lets the leading checkbox toggle a recipe without selecting it', async () => {
      loadMultipleRecipes();
      component.setSourceEnabled('aef:one.json', true);
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();
      const rows = (fixture.nativeElement as HTMLElement).querySelectorAll(
        '.entity-row',
      );
      rows[1].querySelector<HTMLElement>('.p-checkbox-box')!.click();
      expect(component.recipeEnabled('third')).toBeFalse();
      expect(component.recipeEnabled('first')).toBeTrue();
      expect(component.selectedRecipeIndex()).toEqual(0);
      expect(component.selectedSource()!.disabledRecipeIds).toEqual(['third']);
    });
  });
});
