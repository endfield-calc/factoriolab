import { Dataset } from '~/models/dataset';

/** Transfer sources are represented by a key item for an existing location. */
export function getDomainTransferSources(
  data: Pick<Dataset, 'locationIds' | 'itemEntities'>,
  destinations?: ReadonlySet<string>,
): string[] {
  return data.locationIds.filter(
    (id) =>
      data.itemEntities[`domain_key_${id}`]?.category === '__domain_transfer' &&
      (destinations == null ||
        data.locationIds.some(
          (destination) => destination !== id && destinations.has(destination),
        )),
  );
}
