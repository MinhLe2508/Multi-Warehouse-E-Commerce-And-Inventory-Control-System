export function mockPaymentsEnabled(): boolean {
  const environment = process.env.NODE_ENV;
  return (
    environment === 'development' ||
    environment === 'test' ||
    (!environment &&
      process.env.MWH_ADMIN_LOCAL === '1' &&
      process.connected === true)
  );
}
