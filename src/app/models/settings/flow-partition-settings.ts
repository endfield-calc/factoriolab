export interface FlowBaseSettings {
  id: string;
  name: string;
  outputItemIds: string[];
}

export interface FlowPartitionSettings {
  bases: FlowBaseSettings[];
}

export const initialFlowPartitionSettings: FlowPartitionSettings = {
  bases: [],
};

export function parseFlowPartitionSettings(
  value: string | undefined,
): FlowPartitionSettings | undefined {
  if (!value) return;
  try {
    const parsed: unknown = JSON.parse(
      value.startsWith('{') ? value : decodeURIComponent(value),
    );
    if (!parsed || typeof parsed !== 'object') return;
    const {
      bases: baseValues,
      coreItemIds,
      split,
    } = parsed as Record<string, unknown>;
    const strings = (values: unknown): string[] =>
      Array.isArray(values)
        ? [
            ...new Set(
              values.filter(
                (id): id is string => typeof id === 'string' && !!id,
              ),
            ),
          ]
        : [];
    if (Array.isArray(baseValues)) {
      const ids = new Set<string>();
      const bases: FlowBaseSettings[] = [];
      for (const value of baseValues) {
        if (!value || typeof value !== 'object') continue;
        const {
          id,
          name,
          outputItemIds: outputValues,
        } = value as Record<string, unknown>;
        if (typeof id !== 'string' || !id.startsWith('base:') || ids.has(id))
          continue;
        const outputItemIds = strings(outputValues);
        if (!outputItemIds.length) continue;
        ids.add(id);
        bases.push({
          id,
          name: typeof name === 'string' ? name.trim() : '',
          outputItemIds,
        });
      }
      return { bases };
    }
    // Preserve earlier warehouse-boundary selections as one editable base.
    if (Array.isArray(coreItemIds) && typeof split === 'boolean') {
      const outputItemIds = strings(coreItemIds);
      return {
        bases: outputItemIds.length
          ? [{ id: 'base:legacy', name: '', outputItemIds }]
          : [],
      };
    }
    return;
  } catch {
    return;
  }
}
