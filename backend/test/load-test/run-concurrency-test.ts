/**
 * Thin wrapper delegating to canonical load-tests/run-concurrency-test.ts (F214)
 */
import { runConcurrencyTest } from '../../../load-tests/run-concurrency-test';

if (require.main === module) {
  void runConcurrencyTest();
}

export { runConcurrencyTest };
