import { Prisma } from '@prisma/client';
import { PricingError, PricingService } from './pricing.service';

describe('PricingService', () => {
  const service = new PricingService();
  const D = (value: string) => new Prisma.Decimal(value);

  describe('calculateLine', () => {
    it('khớp ví dụ trong API Contract: 150000 x 2, giảm 5%', () => {
      const line = service.calculateLine({
        unitPrice: '150000.00',
        discountPercent: '5',
        quantity: 2,
      });
      expect(service.formatMoney(line.grossTotal)).toBe('300000.00');
      expect(service.formatMoney(line.discountAmount)).toBe('15000.00');
      expect(service.formatMoney(line.lineTotal)).toBe('285000.00');
    });

    it('không giảm giá khi discountPercent bỏ trống hoặc bằng 0', () => {
      const line = service.calculateLine({ unitPrice: '99000', quantity: 3 });
      expect(service.formatMoney(line.discountAmount)).toBe('0.00');
      expect(service.formatMoney(line.lineTotal)).toBe('297000.00');
    });

    it('làm tròn HALF_UP 2 số cho giảm giá của từng dòng', () => {
      // 10.05 * 10% = 1.005 -> HALF_UP = 1.01 (số thực FLOAT sẽ cho 1.00).
      const up = service.calculateLine({
        unitPrice: '10.05',
        discountPercent: '10',
        quantity: 1,
      });
      expect(service.formatMoney(up.discountAmount)).toBe('1.01');
      expect(service.formatMoney(up.lineTotal)).toBe('9.04');

      // 10.04 * 10% = 1.004 -> 1.00
      const down = service.calculateLine({
        unitPrice: '10.04',
        discountPercent: '10',
        quantity: 1,
      });
      expect(service.formatMoney(down.discountAmount)).toBe('1.00');
    });

    it('lineTotal luôn bằng unitPrice * quantity - discountAmount (CHECK của DB)', () => {
      const line = service.calculateLine({
        unitPrice: '33333.33',
        discountPercent: '12.5',
        quantity: 7,
      });
      expect(
        line.lineTotal.equals(
          line.unitPrice.mul(line.quantity).minus(line.discountAmount),
        ),
      ).toBe(true);
    });

    it('giảm 100% thì lineTotal = 0', () => {
      const line = service.calculateLine({
        unitPrice: '50000',
        discountPercent: '100',
        quantity: 2,
      });
      expect(service.formatMoney(line.lineTotal)).toBe('0.00');
    });

    it('nhận Prisma.Decimal như dữ liệu đọc từ DB', () => {
      const line = service.calculateLine({
        unitPrice: D('150000.00'),
        discountPercent: D('5.00'),
        quantity: 1,
      });
      expect(service.formatMoney(line.lineTotal)).toBe('142500.00');
    });

    it('xử lý đúng giá trị lớn nhất của NUMERIC(14,2)', () => {
      const line = service.calculateLine({
        unitPrice: '999999999999.99',
        quantity: 1,
      });
      expect(service.formatMoney(line.lineTotal)).toBe('999999999999.99');
    });

    it('từ chối kiểu number (FLOAT)', () => {
      expect(() =>
        service.calculateLine({
          unitPrice: 0.1 as unknown as string,
          quantity: 1,
        }),
      ).toThrow(PricingError);
    });

    it.each([0, -1, 1.5, Number.NaN])('từ chối quantity = %p', (quantity) => {
      expect(() =>
        service.calculateLine({ unitPrice: '1000', quantity }),
      ).toThrow(PricingError);
    });

    it.each(['-1', '100.01', 'abc'])(
      'từ chối discountPercent = %p',
      (discountPercent) => {
        expect(() =>
          service.calculateLine({
            unitPrice: '1000',
            discountPercent,
            quantity: 1,
          }),
        ).toThrow(PricingError);
      },
    );

    it('từ chối giá âm, giá không phải số và tiền vượt NUMERIC(14,2)', () => {
      expect(() =>
        service.calculateLine({ unitPrice: '-5', quantity: 1 }),
      ).toThrow(PricingError);
      expect(() =>
        service.calculateLine({ unitPrice: 'NaN', quantity: 1 }),
      ).toThrow(PricingError);
      expect(() =>
        service.calculateLine({ unitPrice: '999999999999.99', quantity: 2 }),
      ).toThrow(PricingError);
    });
  });

  describe('calculateOrder', () => {
    it('cộng đúng subtotal, discountTotal, grandTotal và phí giao hàng mặc định 0', () => {
      const order = service.calculateOrder([
        { unitPrice: '150000.00', discountPercent: '5', quantity: 2 },
        { unitPrice: '20000.50', quantity: 1 },
      ]);
      expect(service.formatMoney(order.subtotal)).toBe('320000.50');
      expect(service.formatMoney(order.discountTotal)).toBe('15000.00');
      expect(service.formatMoney(order.shippingFee)).toBe('0.00');
      expect(service.formatMoney(order.grandTotal)).toBe('305000.50');
    });

    it('grandTotal = subtotal - discountTotal + shippingFee (CHECK của DB)', () => {
      const order = service.calculateOrder(
        [
          { unitPrice: '12345.67', discountPercent: '7.5', quantity: 3 },
          { unitPrice: '999.99', discountPercent: '33.33', quantity: 9 },
        ],
        '30000',
      );
      expect(
        order.grandTotal.equals(
          order.subtotal.minus(order.discountTotal).plus(order.shippingFee),
        ),
      ).toBe(true);
      expect(
        order.grandTotal.equals(
          order.lines
            .reduce((sum, l) => sum.plus(l.lineTotal), D('0'))
            .plus(order.shippingFee),
        ),
      ).toBe(true);
    });

    it('không bị sai số dấu phẩy động khi cộng nhiều dòng 0.10', () => {
      const order = service.calculateOrder(
        Array.from({ length: 3 }, () => ({ unitPrice: '0.10', quantity: 1 })),
      );
      expect(service.formatMoney(order.grandTotal)).toBe('0.30');
    });

    it('từ chối đơn rỗng và tổng tiền vượt giới hạn', () => {
      expect(() => service.calculateOrder([])).toThrow(PricingError);
      expect(() =>
        service.calculateOrder([
          { unitPrice: '999999999999.99', quantity: 1 },
          { unitPrice: '1.00', quantity: 1 },
        ]),
      ).toThrow(PricingError);
    });
  });
});
