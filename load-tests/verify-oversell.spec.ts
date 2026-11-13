import {
  evaluateOversell,
  generateMarkdownReport,
  type OversellVerificationInput,
} from './oversell-verifier';

describe('[Task 32] evaluateOversell & verify-oversell logic (F209, F218)', () => {
  const baseTestData = {
    productId: 'prod-uuid-1',
    productSku: 'SKU-TEST-01',
    productName: 'Sản phẩm Test Concurrency Oversell',
    initialStock: 10,
    totalVUs: 100,
    warehouseCode: 'WH-HN01',
    warehouseName: 'Kho Trung Tâm Hà Nội',
    runId: 'run-canonical-100',
  };

  describe('Fixture 1: Expected 10 nhưng DB reserved/orders/HOLDING đều 0 (Bắt bug báo cáo cũ)', () => {
    it('phải kết luận FAIL hoặc INVALID, tuyệt đối không được PASS', () => {
      const input: OversellVerificationInput = {
        testData: baseTestData,
        dbData: {
          currentStock: 10,
          currentReservedStock: 0,
          availableStock: 10,
          distinctOrdersCount: 0,
          totalSoldQuantity: 0,
          holdingReservationsCount: 0,
          totalHoldingQuantity: 0,
        },
        metricsSummary: {
          runId: 'run-canonical-100',
          totalRequests: 100,
          success201: 0,
          conflict409: 100,
        },
      };

      const result = evaluateOversell(input);

      expect(result.allPassed).toBe(false);
      expect(result.verdict).toBe('FAIL');
      expect(result.exitCode).toBe(1);

      // Check cụ thể: số đơn hàng tạo mới phải FAIL
      const soldCheck = result.checks.find((c) => c.id === 'SOLD_COUNT_MATCH');
      expect(soldCheck).toBeDefined();
      expect(soldCheck?.status).toBe('FAIL');

      // Báo cáo Markdown không được chứa kết luận PASS giả tạo
      expect(result.markdownReport).not.toContain(
        'ĐẠT CHUẨN HOÀN TOÀN (100% PASS)',
      );
      expect(result.markdownReport).toContain('KHÔNG ĐẠT (FAIL)');
    });
  });

  describe('Fixture 2: HTTP báo thành công nhưng hậu kiểm DB không khớp', () => {
    it('phải trả về FAIL khi HTTP báo 10 đơn thành công nhưng DB chỉ có 0 đơn', () => {
      const input: OversellVerificationInput = {
        testData: baseTestData,
        dbData: {
          currentStock: 10,
          currentReservedStock: 0,
          availableStock: 10,
          distinctOrdersCount: 0,
          totalSoldQuantity: 0,
          holdingReservationsCount: 0,
          totalHoldingQuantity: 0,
        },
        metricsSummary: {
          runId: 'run-canonical-100',
          totalRequests: 100,
          success201: 10, // Giả định k6 báo 10 đơn success 201
          conflict409: 90,
        },
      };

      const result = evaluateOversell(input);

      expect(result.allPassed).toBe(false);
      expect(result.verdict).toBe('FAIL');
      const httpDbCheck = result.checks.find((c) => c.id === 'HTTP_DB_MATCH');
      expect(httpDbCheck).toBeDefined();
      expect(httpDbCheck?.status).toBe('FAIL');
      expect(httpDbCheck?.message).toContain('Mâu thuẫn dữ liệu');
    });
  });

  describe('Fixture 3: Reserved lớn hơn stock hoặc available âm (Oversell thực tế)', () => {
    it('phải phát hiện tồn kho âm và kết luận FAIL', () => {
      const input: OversellVerificationInput = {
        testData: baseTestData,
        dbData: {
          currentStock: 10,
          currentReservedStock: 15,
          availableStock: -5,
          distinctOrdersCount: 15,
          totalSoldQuantity: 15,
          holdingReservationsCount: 15,
          totalHoldingQuantity: 15,
        },
      };

      const result = evaluateOversell(input);

      expect(result.allPassed).toBe(false);
      expect(result.verdict).toBe('FAIL');

      const nonNegativeCheck = result.checks.find(
        (c) => c.id === 'NON_NEGATIVE_INVENTORY',
      );
      expect(nonNegativeCheck?.status).toBe('FAIL');

      const zeroOversellCheck = result.checks.find(
        (c) => c.id === 'ZERO_OVERSELL',
      );
      expect(zeroOversellCheck?.status).toBe('FAIL');
    });
  });

  describe('Fixture 4: Đủ dữ liệu và mọi invariant khớp chuẩn (Trường hợp đạt chuẩn)', () => {
    it('phải kết luận PASS và exitCode 0 khi mọi tiêu chí đều thỏa mãn', () => {
      const input: OversellVerificationInput = {
        testData: baseTestData,
        dbData: {
          currentStock: 10,
          currentReservedStock: 10,
          availableStock: 0,
          distinctOrdersCount: 10,
          totalSoldQuantity: 10,
          holdingReservationsCount: 10,
          totalHoldingQuantity: 10,
        },
        metricsSummary: {
          runId: 'run-canonical-100',
          totalRequests: 100,
          success201: 10,
          conflict409: 90,
          durationMs: {
            min: 50.2,
            avg: 210.5,
            med: 180.0,
            p90: 890.0,
            p95: 1130.0,
            p99: 1450.0,
            max: 1800.0,
          },
          rps: 45.2,
        },
      };

      const result = evaluateOversell(input);

      expect(result.allPassed).toBe(true);
      expect(result.verdict).toBe('PASS');
      expect(result.exitCode).toBe(0);
      expect(result.markdownReport).toContain('ĐẠT CHUẨN HOÀN TOÀN (100% PASS)');
      expect(result.markdownReport).toContain('1450.0 ms');
    });
  });

  describe('Fixture 5: Thiếu dữ liệu bắt buộc hoặc trộn 2 runId khác nhau', () => {
    it('phải kết luận INVALID khi dbData bị null hoặc thiếu', () => {
      const input: OversellVerificationInput = {
        testData: baseTestData,
        dbData: null,
      };

      const result = evaluateOversell(input);

      expect(result.allPassed).toBe(false);
      expect(result.verdict).toBe('INVALID');
      expect(result.exitCode).toBe(1);
      const dbCheck = result.checks.find((c) => c.id === 'DB_DATA_AVAILABLE');
      expect(dbCheck?.status).toBe('INVALID');
    });

    it('phải kết luận INVALID khi trộn 2 runId khác nhau giữa testData và summary', () => {
      const input: OversellVerificationInput = {
        testData: { ...baseTestData, runId: 'run-2026-11-13-A' },
        dbData: {
          currentStock: 10,
          currentReservedStock: 10,
          availableStock: 0,
          distinctOrdersCount: 10,
          totalSoldQuantity: 10,
          holdingReservationsCount: 10,
          totalHoldingQuantity: 10,
        },
        metricsSummary: {
          runId: 'run-2026-11-13-DIFFERENT_B',
          totalRequests: 100,
          success201: 10,
        },
      };

      const result = evaluateOversell(input);

      expect(result.allPassed).toBe(false);
      expect(result.verdict).toBe('INVALID');
      expect(result.exitCode).toBe(1);
      const runCheck = result.checks.find((c) => c.id === 'RUN_IDENTITY_MATCH');
      expect(runCheck?.status).toBe('INVALID');
      expect(runCheck?.message).toContain('Mâu thuẫn danh tính');
    });
  });

  describe('Kiểm tra xử lý p99 khi thiếu metric', () => {
    it('phải hiển thị unavailable thay vì 0 hoặc 0 ms khi p99 bị thiếu', () => {
      const input: OversellVerificationInput = {
        testData: baseTestData,
        dbData: {
          currentStock: 10,
          currentReservedStock: 10,
          availableStock: 0,
          distinctOrdersCount: 10,
          totalSoldQuantity: 10,
          holdingReservationsCount: 10,
          totalHoldingQuantity: 10,
        },
        metricsSummary: {
          runId: 'run-canonical-100',
          durationMs: {
            min: 50,
            avg: 200,
            p95: 1100,
            // p99 intentionally omitted
          },
        },
      };

      const result = evaluateOversell(input);
      expect(result.markdownReport).toContain('unavailable');
      expect(result.markdownReport).not.toContain('`0.0 ms`');
      expect(result.markdownReport).not.toContain('`0 ms`');
    });
  });
});
