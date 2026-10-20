import { TestBed } from '@angular/core/testing';

import { CustomRecipeData } from '~/models/custom-recipe';
import { Dataset } from '~/models/dataset';

import { CustomRecipeIconService } from './custom-recipe-icon.service';

describe('CustomRecipeIconService', () => {
  let service: CustomRecipeIconService;
  let data: Pick<Dataset, 'iconFile' | 'iconEntities'>;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(CustomRecipeIconService);
    const sprite = document.createElement('canvas');
    sprite.width = 128;
    sprite.height = 64;
    const context = sprite.getContext('2d')!;
    context.fillStyle = '#ff0000';
    context.fillRect(0, 0, 64, 64);
    context.fillStyle = '#0000ff';
    context.fillRect(64, 0, 64, 64);
    data = {
      iconFile: sprite.toDataURL(),
      iconEntities: {
        main: {
          id: 'main',
          position: '0px 0px',
          color: 'red',
          invertLight: true,
        },
        secondary: { id: 'secondary', position: '-64px 0px', color: 'blue' },
      },
    };
  });

  async function pixels(uri: string): Promise<CanvasRenderingContext2D> {
    const image = new Image();
    image.src = uri;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 64;
    const context = canvas.getContext('2d')!;
    context.drawImage(image, 0, 0);
    return context;
  }

  function pixel(
    context: CanvasRenderingContext2D,
    x: number,
    y: number,
  ): number[] {
    return Array.from(context.getImageData(x, y, 1, 1).data);
  }

  it('crops and overlays a self-contained badge only in the lower-right corner and reuses it', async () => {
    const icon: CustomRecipeData = {
      iconText: 'A',
      iconId: 'main',
      secondaryIcon: { iconText: 'B', iconId: 'secondary' },
    };
    const first = service.loadIcon(icon, data, false);
    expect(service.loadIcon(icon, data, false)).toBe(first);
    const uri = await first;
    expect(uri).toMatch(/^data:image\/png;base64,/);
    const context = await pixels(uri);
    expect(pixel(context, 1, 1)).toEqual([255, 0, 0, 255]);
    expect(pixel(context, 24, 63)).toEqual([255, 0, 0, 255]);
    expect(pixel(context, 63, 24)).toEqual([255, 0, 0, 255]);
    expect(pixel(context, 27, 27)).toEqual([0, 0, 255, 255]);
    expect(pixel(context, 63, 63)).toEqual([0, 0, 255, 255]);
    expect(service.resolve(icon, data, false)).toEqual(uri);
    const light = await pixels(await service.loadIcon(icon, data, true));
    expect(pixel(light, 1, 1)).toEqual([0, 255, 255, 255]);
    expect(pixel(light, 63, 63)).toEqual([0, 0, 255, 255]);
  });

  it('uses independent text backgrounds and falls back to text when a built-in icon disappears', async () => {
    const icon: CustomRecipeData = {
      iconId: 'removed',
      iconText: '<',
      iconBackground: '#ff0000',
      secondaryIcon: { iconText: '&', iconBackground: '#0000ff' },
    };
    const context = await pixels(await service.loadIcon(icon, data, false));
    expect(pixel(context, 1, 1)).toEqual([255, 0, 0, 255]);
    expect(pixel(context, 63, 63)).toEqual([0, 0, 255, 255]);
    const changed = {
      ...icon,
      secondaryIcon: { ...icon.secondaryIcon!, iconBackground: '#00ff00' },
    };
    const uri = await service.loadIcon(changed, data, false);
    expect(pixel(await pixels(uri), 63, 63)).toEqual([0, 255, 0, 255]);
    expect(service.resolve({ iconText: 'A' }, data, false)).toBeUndefined();
  });

  it('supports text and built-in icons in either layer', async () => {
    for (const icon of [
      {
        iconId: 'main',
        iconText: 'A',
        secondaryIcon: { iconText: 'B', iconBackground: '#0000ff' },
      },
      {
        iconText: 'A',
        iconBackground: '#ff0000',
        secondaryIcon: { iconId: 'secondary', iconText: 'B' },
      },
    ]) {
      const context = await pixels(await service.loadIcon(icon, data, false));
      expect(pixel(context, 1, 1)).toEqual([255, 0, 0, 255]);
      expect(pixel(context, 63, 63)).toEqual([0, 0, 255, 255]);
    }
  });
});
