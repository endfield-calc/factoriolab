import { ModData } from '~/data/schema/mod-data';
import { ModHash } from '~/data/schema/mod-hash';

export function isAppendOnlyDataset(id: string): boolean;
export function appendHashEntries(
  previous: Partial<ModHash>,
  candidates: Partial<ModHash>,
): Required<ModHash>;
export function appendOnlyHash(
  previous: Partial<ModHash>,
  data: ModData,
  frozen: Partial<ModHash>,
): Required<ModHash>;
