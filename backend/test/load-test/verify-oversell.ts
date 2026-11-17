/**
 * Thin wrapper delegating to canonical load-tests/verify-oversell.ts (F215)
 */
import { verifyOversell } from '../../../load-tests/verify-oversell';

if (require.main === module) {
  void verifyOversell();
}

export { verifyOversell };
