import { parseFlowPartitionSettings } from './flow-partition-settings';

describe('flow partition settings', () => {
  it('restores encoded or bare base definitions with Unicode and URL punctuation', () => {
    const settings = {
      bases: [
        {
          id: 'base:a',
          name: '电池 100% &= #~*',
          outputItemIds: ['息壤', 'v_custom'],
        },
      ],
    };
    expect(parseFlowPartitionSettings(JSON.stringify(settings))).toEqual(
      settings,
    );
    expect(
      parseFlowPartitionSettings(encodeURIComponent(JSON.stringify(settings))),
    ).toEqual(settings);
  });
  it('normalizes base definitions and safely ignores invalid or duplicate entries', () => {
    for (const value of [undefined, '%', '[]', '{}', '{"bases":false}'])
      expect(parseFlowPartitionSettings(value)).toBeUndefined();
    expect(
      parseFlowPartitionSettings(
        JSON.stringify({
          bases: [
            null,
            { id: 'main', outputItemIds: ['a'] },
            { id: 'base:a', name: ' A ', outputItemIds: ['a', 'a', 4, ''] },
            { id: 'base:a', name: 'duplicate', outputItemIds: ['b'] },
            { id: 'base:empty', outputItemIds: [] },
          ],
        }),
      ),
    ).toEqual({ bases: [{ id: 'base:a', name: 'A', outputItemIds: ['a'] }] });
  });
  it('migrates legacy material selections into one editable base', () => {
    expect(
      parseFlowPartitionSettings(
        JSON.stringify({ coreItemIds: ['a', 'b'], split: true, names: {} }),
      ),
    ).toEqual({
      bases: [{ id: 'base:legacy', name: '', outputItemIds: ['a', 'b'] }],
    });
    expect(
      parseFlowPartitionSettings(
        JSON.stringify({ coreItemIds: [], split: false }),
      ),
    ).toEqual({ bases: [] });
  });
});
