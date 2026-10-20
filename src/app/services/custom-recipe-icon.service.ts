import { DOCUMENT } from '@angular/common';
import { inject, Injectable, signal } from '@angular/core';

import { customRecipeTextColor } from '~/helpers/custom-recipe-icon';
import {
  CustomRecipeData,
  CustomRecipeIconData,
  DEFAULT_CUSTOM_RECIPE_BACKGROUND,
} from '~/models/custom-recipe';
import { Dataset } from '~/models/dataset';

type IconDataset = Pick<Dataset, 'iconFile' | 'iconEntities'>;

@Injectable({ providedIn: 'root' })
export class CustomRecipeIconService {
  private document = inject(DOCUMENT);
  images = signal<Record<string, string>>({});
  private pending = new Map<string, Promise<string>>();
  private sprites = new Map<string, Promise<HTMLImageElement>>();

  resolve(
    icon: CustomRecipeData,
    data: IconDataset,
    light: boolean,
  ): string | undefined {
    if (!icon.secondaryIcon) return undefined;
    const ready = this.images()[this.key(icon, data, light)];
    if (!ready) {
      // Display the existing main icon while the local sprite loads.
      void this.loadIcon(icon, data, light).catch(() => {
        // Keep the main icon if the local sprite cannot be loaded.
      });
    }
    return ready;
  }

  loadIcon(
    icon: CustomRecipeData,
    data: IconDataset,
    light: boolean,
  ): Promise<string> {
    const key = this.key(icon, data, light);
    const cached = this.pending.get(key);
    if (cached) return cached;
    const promise = this.compose(icon, data, light)
      .then((uri) => {
        this.images.update((images) => ({ ...images, [key]: uri }));
        return uri;
      })
      .catch((error: unknown) => {
        this.pending.delete(key);
        throw error;
      });
    this.pending.set(key, promise);
    return promise;
  }

  private key(
    icon: CustomRecipeData,
    data: IconDataset,
    light: boolean,
  ): string {
    return JSON.stringify([
      icon,
      data.iconFile,
      icon.iconId ? data.iconEntities[icon.iconId] : null,
      icon.secondaryIcon?.iconId
        ? data.iconEntities[icon.secondaryIcon.iconId]
        : null,
      light,
    ]);
  }

  private async compose(
    icon: CustomRecipeData,
    data: IconDataset,
    light: boolean,
  ): Promise<string> {
    const parts = [icon, ...(icon.secondaryIcon ? [icon.secondaryIcon] : [])];
    const sprite = parts.some(
      (part) => part.iconId && data.iconEntities[part.iconId],
    )
      ? await this.loadSprite(data.iconFile)
      : undefined;
    const canvas = this.document.createElement('canvas');
    canvas.width = canvas.height = 64;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas rendering is unavailable');
    const draw = (
      part: CustomRecipeIconData,
      x: number,
      y: number,
      size: number,
    ): void => {
      const builtIn = part.iconId ? data.iconEntities[part.iconId] : undefined;
      context.save();
      if (builtIn && sprite) {
        const [sx, sy] = builtIn.position
          .split(' ')
          .map((value) => -Number.parseFloat(value));
        context.filter = light && builtIn.invertLight ? 'invert(1)' : 'none';
        context.drawImage(sprite, sx, sy, 64, 64, x, y, size, size);
      } else {
        const background =
          part.iconBackground ?? DEFAULT_CUSTOM_RECIPE_BACKGROUND;
        context.fillStyle = background;
        context.fillRect(x, y, size, size);
        context.fillStyle = customRecipeTextColor(background);
        const fontSize = Array.from(part.iconText).length > 1 ? 28 : 38;
        context.font = `700 ${String((fontSize * size) / 64)}px Arial,sans-serif`;
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText(part.iconText, x + size / 2, y + (size * 35) / 64);
      }
      context.restore();
    };
    draw(icon, 0, 0, 64);
    if (icon.secondaryIcon) draw(icon.secondaryIcon, 25.6, 25.6, 38.4);
    // Embed the rendered pixels so both graph renderers and PNG exports work
    // without relying on external images inside an SVG data URI.
    return canvas.toDataURL('image/png');
  }

  private loadSprite(url: string): Promise<HTMLImageElement> {
    const cached = this.sprites.get(url);
    if (cached) return cached;
    const promise = new Promise<HTMLImageElement>((resolve, reject) => {
      const image = this.document.createElement('img');
      image.onload = (): void => {
        resolve(image);
      };
      image.onerror = (): void => {
        reject(new Error('Unable to load the icon sprite'));
      };
      image.src = url;
    });
    const loaded = promise.catch((error: unknown) => {
      this.sprites.delete(url);
      throw error;
    });
    this.sprites.set(url, loaded);
    return loaded;
  }
}
