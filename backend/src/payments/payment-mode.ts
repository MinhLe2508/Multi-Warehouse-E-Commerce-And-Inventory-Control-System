export function mockPaymentsEnabled(): boolean {
  return process.env.NODE_ENV === 'test';
}
