import { createRequire } from 'node:module';

export function testDependency(name) {
  const local = createRequire(import.meta.url);
  try { return local(name); } catch (error) {
    if (error.code !== 'MODULE_NOT_FOUND') throw error;
    // Optional isolated test installation; no production dependency changes.
    return createRequire(new URL('../../../test-tools/package.json', import.meta.url))(name);
  }
}
