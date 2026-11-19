import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

/**
  PricingService - tính tiền cho đơn hàng bằng Decimal, TUYỆT ĐỐI KHÔNG dùng
  number/FLOAT (0.1 + 0.2 !== 0.3 trong số thực dấu phẩy động).

  Quy tắc nghiệp vụ (khớp docs/api/openapi.yaml - POST /orders và các CHECK
  trong migration manual_constraints_and_functions):
  - Tiền lưu NUMERIC(14,2): tối đa 999999999999.99, luôn 2 chữ số thập phân.
  - discountAmount của TỪNG DÒNG = round(unitPrice * quantity * discountPercent / 100),
    làm tròn HALF_UP về 2 chữ số.
  - lineTotal      = unitPrice * quantity - discountAmount   (chk_oi_line_total)
  - subtotal       = tổng (unitPrice * quantity) trước giảm giá
  - grandTotal     = subtotal - discountTotal + shippingFee   (chk_orders_grand_total)
  - Phí giao hàng mặc định 0 VND (đề xuất bản 0.1).

  Service này thuần tính toán: không truy vấn DB, không phụ thuộc Prisma Client
  nên dễ unit test. Giá và % giảm phải do Backend đọc từ DB, không nhận từ khách.
 */

// Giá trị tiền hợp lệ: Decimal hoặc chuỗi. Cố tình KHÔNG cho phép kiểu number.
export type MoneyInput = Prisma.Decimal | string;

export const MONEY_SCALE = 2;
// Giới hạn của NUMERIC(14,2).
export const MAX_MONEY = new Prisma.Decimal('999999999999.99');
export const DEFAULT_SHIPPING_FEE = '0.00';

const ROUND_HALF_UP = Prisma.Decimal.ROUND_HALF_UP;
const ZERO = new Prisma.Decimal(0);
const HUNDRED = new Prisma.Decimal(100);

export class PricingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PricingError';
  }
}

export interface PricingLineInput {
  unitPrice: MoneyInput;
  // Phần trăm giảm giá 0..100 (cột products.discount_percent).
  discountPercent?: MoneyInput;
  // Số nguyên >= 1.
  quantity: number;
}

export interface PricedLine {
  quantity: number;
  unitPrice: Prisma.Decimal;
  // unitPrice * quantity, trước giảm giá.
  grossTotal: Prisma.Decimal;
  discountAmount: Prisma.Decimal;
  // grossTotal - discountAmount.
  lineTotal: Prisma.Decimal;
}

export interface PricedOrder {
  lines: PricedLine[];
  subtotal: Prisma.Decimal;
  discountTotal: Prisma.Decimal;
  shippingFee: Prisma.Decimal;
  grandTotal: Prisma.Decimal;
}

@Injectable()
export class PricingService {
  /**
    Tính tiền một dòng đơn hàng.
    Ví dụ: đơn giá 150000.00, số lượng 2, giảm 5% -> discountAmount 15000.00,
    lineTotal 285000.00.
   */
  calculateLine(input: PricingLineInput): PricedLine {
    const unitPrice = this.toMoney(input.unitPrice, 'unitPrice');
    const percent = this.toPercent(input.discountPercent);
    const { quantity } = input;

    if (!Number.isInteger(quantity) || quantity < 1) {
      throw new PricingError('quantity phải là số nguyên >= 1.');
    }

    const grossTotal = unitPrice.mul(quantity);
    // Chặn sớm để các phép nhân bên dưới luôn nằm trong độ chính xác của Decimal.
    this.assertWithinLimit(grossTotal, 'Thành tiền của dòng hàng');

    const discountAmount = grossTotal
      .mul(percent)
      .div(HUNDRED)
      .toDecimalPlaces(MONEY_SCALE, ROUND_HALF_UP);
    const lineTotal = grossTotal.minus(discountAmount);

    return { quantity, unitPrice, grossTotal, discountAmount, lineTotal };
  }

  /**
    Tính tiền cả đơn: từng dòng + tổng hợp.
    Tổng hợp bằng cách cộng các giá trị ĐÃ làm tròn của từng dòng nên luôn
    thỏa các CHECK của DB.
   */
  calculateOrder(
    items: PricingLineInput[],
    shippingFee: MoneyInput = DEFAULT_SHIPPING_FEE,
  ): PricedOrder {
    if (items.length === 0) {
      throw new PricingError('Đơn hàng phải có ít nhất 1 dòng hàng.');
    }

    const fee = this.toMoney(shippingFee, 'shippingFee');
    const lines = items.map((item) => this.calculateLine(item));

    const subtotal = lines.reduce(
      (sum, line) => sum.plus(line.grossTotal),
      ZERO,
    );
    const discountTotal = lines.reduce(
      (sum, line) => sum.plus(line.discountAmount),
      ZERO,
    );
    const grandTotal = subtotal.minus(discountTotal).plus(fee);
    this.assertWithinLimit(subtotal, 'subtotal');
    this.assertWithinLimit(grandTotal, 'grandTotal');

    return { lines, subtotal, discountTotal, shippingFee: fee, grandTotal };
  }

  // Chuỗi tiền chuẩn 2 chữ số thập phân để trả ra API, ví dụ '285000.00'.
  formatMoney(value: Prisma.Decimal): string {
    return value.toFixed(MONEY_SCALE);
  }

  private toMoney(value: MoneyInput, field: string): Prisma.Decimal {
    const decimal = this.parseDecimal(value, field);
    if (decimal.isNegative()) {
      throw new PricingError(`${field} không được âm.`);
    }
    const rounded = decimal.toDecimalPlaces(MONEY_SCALE, ROUND_HALF_UP);
    this.assertWithinLimit(rounded, field);
    return rounded;
  }

  private toPercent(value: MoneyInput | undefined): Prisma.Decimal {
    if (value === undefined) return ZERO;
    const percent = this.parseDecimal(value, 'discountPercent');
    if (percent.isNegative() || percent.greaterThan(HUNDRED)) {
      throw new PricingError('discountPercent phải nằm trong khoảng 0..100.');
    }
    return percent;
  }

  private parseDecimal(value: MoneyInput, field: string): Prisma.Decimal {
    // Chặn number ở runtime (phòng trường hợp ép kiểu từ any/JSON).
    if (typeof value === 'number') {
      throw new PricingError(
        `${field} không được là kiểu number (FLOAT); hãy dùng chuỗi hoặc Decimal.`,
      );
    }
    try {
      const decimal = new Prisma.Decimal(value);
      if (!decimal.isFinite()) throw new Error('not finite');
      return decimal;
    } catch {
      throw new PricingError(`${field} không phải số hợp lệ.`);
    }
  }

  private assertWithinLimit(value: Prisma.Decimal, field: string): void {
    if (value.greaterThan(MAX_MONEY)) {
      throw new PricingError(
        `${field} vượt giới hạn NUMERIC(14,2) (${MAX_MONEY.toFixed(MONEY_SCALE)}).`,
      );
    }
  }
}
