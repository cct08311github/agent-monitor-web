/**
 * commandGroups.ts
 *
 * Generic utility for grouping a list of items by their `category` field.
 * Items with a missing or blank category are placed into `defaultCategory`.
 * An optional `order` array controls which groups appear first; groups not
 * listed in `order` are appended afterwards in Map insertion order.
 */

export interface CommandGroup<T> {
  category: string
  commands: T[]
}

/**
 * Groups `items` by their `category` field.
 *
 * @param items           - The items to group.
 * @param order           - Preferred category order.  Groups in this list come first.
 * @param defaultCategory - Category assigned to items whose `category` field is
 *                          absent or blank.  Defaults to `'Other'`.
 */
export function groupByCategory<T extends { category?: string }>(
  items: ReadonlyArray<T>,
  order: ReadonlyArray<string> = [],
  defaultCategory: string = 'Other',
): CommandGroup<T>[] {
  const buckets = new Map<string, T[]>()

  for (const item of items) {
    const cat =
      item.category !== undefined && item.category.trim() !== ''
        ? item.category
        : defaultCategory

    const existing = buckets.get(cat)
    if (existing) {
      existing.push(item)
    } else {
      buckets.set(cat, [item])
    }
  }

  const result: CommandGroup<T>[] = []

  // First: categories listed in `order` (skip those with no items)
  for (const cat of order) {
    const arr = buckets.get(cat)
    if (arr && arr.length > 0) {
      result.push({ category: cat, commands: arr })
      buckets.delete(cat)
    }
  }

  // Then: remaining categories in insertion order
  for (const [cat, arr] of buckets) {
    result.push({ category: cat, commands: arr })
  }

  return result
}
