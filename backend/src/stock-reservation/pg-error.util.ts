// Đọc SQLSTATE và thông báo từ lỗi Prisma khi chạy raw query qua driver adapter pg.
//
// Với adapter-pg, lỗi SQL bị Prisma bọc thành PrismaClientKnownRequestError (P2010) và
// SQLSTATE nằm ở meta.driverAdapterError.cause.originalCode. Hàm này cũng chấp nhận
// các dạng khác (meta.code, error.code, cause) để không phụ thuộc cứng vào một phiên bản.

export interface SqlErrorInfo {
  sqlState?: string;
  message?: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const asString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.length > 0 ? value : undefined;

export function readSqlError(error: unknown): SqlErrorInfo {
  if (!isRecord(error)) return {};

  const meta = isRecord(error.meta) ? error.meta : undefined;
  const adapterError =
    meta && isRecord(meta.driverAdapterError)
      ? meta.driverAdapterError
      : undefined;
  const adapterCause =
    adapterError && isRecord(adapterError.cause)
      ? adapterError.cause
      : undefined;
  const cause = isRecord(error.cause) ? error.cause : undefined;

  const sqlState =
    asString(adapterCause?.originalCode) ??
    asString(adapterCause?.code) ??
    asString(meta?.code) ??
    asString(cause?.originalCode) ??
    asString(cause?.code) ??
    (/^[0-9A-Z]{5}$/.test(asString(error.code) ?? '')
      ? asString(error.code)
      : undefined);

  const message =
    asString(adapterCause?.originalMessage) ??
    asString(adapterCause?.message) ??
    asString(meta?.message) ??
    asString(cause?.message) ??
    asString(error.message);

  return { sqlState, message };
}
