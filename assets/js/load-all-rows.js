// A large range is still capped by PostgREST. Advance by the number actually
// returned, with a stable order supplied by the caller, until the pool is complete.
export async function loadAllRows(query, pageSize = 500) {
  const rows = [];
  let total = null;
  while (true) {
    const { data, error, count } = await query(rows.length === 0)
      .range(rows.length, rows.length + pageSize - 1);
    if (error) throw error;
    if (!Array.isArray(data)) throw new Error('Could not load the complete reference data.');
    if (Number.isInteger(count)) total = count;
    if (!data.length) {
      if (total !== null && rows.length < total) {
        throw new Error('Reference data changed while loading. Please reload the admin tools.');
      }
      return rows;
    }
    rows.push(...data);
    if (total !== null && rows.length >= total) return rows;
  }
}
