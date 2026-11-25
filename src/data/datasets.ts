import { ModInfo } from '~/data/mod';
import { toRecord } from '~/utils/record';

export const DEFAULT_MOD = 'aef';

export interface Datasets {
  mods: ModInfo[];
  modHashV0: (string | null)[];
  modHash: (string | null)[];
}

export const datasets: Datasets = {
  mods: [{ id: DEFAULT_MOD, name: 'options.game.endfield', game: 'endfield' }],
  // Preserve the indices used by legacy links and the native migration tests.
  modHashV0: ['1.1', '1.0', DEFAULT_MOD],
  modHash: ['1.1', '1.0', ...Array<null>(14).fill(null), DEFAULT_MOD],
};

export const modRecord = toRecord(datasets.mods);
