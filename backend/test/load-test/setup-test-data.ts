/**
 * Thin wrapper delegating to canonical load-tests/setup-test-data.ts (F213)
 */
import { setupTestData } from '../../../load-tests/setup-test-data';

if (require.main === module) {
  void setupTestData();
}

export { setupTestData };
