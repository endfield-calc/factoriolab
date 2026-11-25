import {
  IconData,
  IconJson,
  parseIcon,
  parseIconData,
} from '~/data/schema/icon-data';
import { toRecord } from '~/utils/record';

export const systemIcons: IconJson[] = [
  { id: 'transparent', x: 66, y: 0, color: '#000000' },
  { id: 'module', x: 132, y: 0, color: '#ffffff' },
  { id: 'pipe', x: 198, y: 0, color: '#6d644e' },
  { id: 'q-any', x: 264, y: 0, color: '#716d6f' },
  { id: 'endfield', x: 0, y: 66, color: '#d9bd4c' },
  { id: 'rocket-pod', x: 132, y: 198, color: '#504b42' },
];

export const systemIconsRecord = toRecord(
  systemIcons.map(
    (i): IconData => parseIconData(parseIcon(i), 'icons/icons.webp'),
  ),
);
