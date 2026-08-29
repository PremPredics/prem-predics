// Bound the whole operation, including time waiting for an auth refresh lock.
// AbortSignal alone only cancels a request after it has reached fetch().
export async function boundedRead(operation, timeoutMs = 6000) {
  const controller = new AbortController();
  let timer;
  try {
    return await Promise.race([
      Promise.resolve().then(() => operation(controller.signal)),
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new Error('The connection timed out. Please retry.'));
        }, timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export async function readData(query, { attempts = 2, timeoutMs = 6000 } = {}) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await boundedRead((signal) => query().abortSignal(signal), timeoutMs);
      if (response.error) throw response.error;
      return response.data;
    } catch (error) {
      // Retrying an unauthorized request or an invalid query cannot fix it.
      if (attempt + 1 === attempts || /^(22|23|28|42|PGRST)/.test(error?.code || '')) throw error;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
}
