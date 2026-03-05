export const applyStableCatalogOrder = <T extends { id: string }>(
  previousOrder: string[] | undefined,
  nextSortedRows: T[]
): { orderedRows: T[]; order: string[] } => {
  const sortedIds = nextSortedRows.map((row) => row.id);
  const sortedIndexById = new Map<string, number>();
  for (let i = 0; i < sortedIds.length; i += 1) {
    sortedIndexById.set(sortedIds[i]!, i);
  }

  if (!Array.isArray(previousOrder) || previousOrder.length === 0) {
    return {
      orderedRows: nextSortedRows,
      order: sortedIds,
    };
  }

  const existingOrder = previousOrder.filter((id) => sortedIndexById.has(id));
  const existingSet = new Set(existingOrder);
  const mergedOrder = [...existingOrder];

  for (const id of sortedIds) {
    if (existingSet.has(id)) continue;
    const sortedIndex = sortedIndexById.get(id);
    if (typeof sortedIndex !== "number") continue;

    let insertAt = mergedOrder.length;
    let anchored = false;
    for (let i = sortedIndex - 1; i >= 0; i -= 1) {
      const prevSortedId = sortedIds[i]!;
      const prevPos = mergedOrder.indexOf(prevSortedId);
      if (prevPos >= 0) {
        insertAt = prevPos + 1;
        anchored = true;
        break;
      }
    }

    if (!anchored) {
      for (let i = sortedIndex + 1; i < sortedIds.length; i += 1) {
        const nextSortedId = sortedIds[i]!;
        const nextPos = mergedOrder.indexOf(nextSortedId);
        if (nextPos >= 0) {
          insertAt = nextPos;
          break;
        }
      }
    }

    mergedOrder.splice(insertAt, 0, id);
    existingSet.add(id);
  }

  const rowsById = new Map(nextSortedRows.map((row) => [row.id, row] as const));
  const orderedRows: T[] = [];
  for (const id of mergedOrder) {
    const row = rowsById.get(id);
    if (row) orderedRows.push(row);
  }

  return {
    orderedRows,
    order: mergedOrder,
  };
};

