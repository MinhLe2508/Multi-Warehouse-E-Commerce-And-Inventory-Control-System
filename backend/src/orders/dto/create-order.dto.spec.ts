import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { CreateOrderDto } from './create-order.dto';

const productA = 'ad8fb080-6e3a-4a26-81b2-e948711312ac';
const productB = '27ea271e-395e-4196-918a-866a38a11fb4';

const validBody = () => ({
  items: [{ productId: productA, quantity: 2 }],
  shippingRecipient: 'Khách demo',
  shippingPhone: '0900000000',
  shippingAddress: 'Địa chỉ demo tại TP.HCM',
  shippingRegion: 'Miền Nam',
});

// Cấu hình giống main.ts.
const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
});
const run = (body: unknown) =>
  pipe.transform(body, { type: 'body', metatype: CreateOrderDto });

async function messagesOf(body: unknown): Promise<string> {
  try {
    await run(body);
  } catch (error) {
    if (error instanceof BadRequestException) {
      return JSON.stringify(error.getResponse());
    }
    throw error;
  }
  return '';
}

describe('CreateOrderDto', () => {
  it('chấp nhận body hợp lệ theo API Contract', async () => {
    const dto = (await run(validBody())) as CreateOrderDto;
    expect(dto).toBeInstanceOf(CreateOrderDto);
    expect(dto.items[0].quantity).toBe(2);
  });

  it('shippingRegion là tùy chọn', async () => {
    const body: Record<string, unknown> = validBody();
    delete body.shippingRegion;
    await expect(run(body)).resolves.toBeDefined();
  });

  it('trim khoảng trắng ở thông tin giao hàng', async () => {
    const dto = (await run({
      ...validBody(),
      shippingRecipient: '  Nguyễn Văn A  ',
      shippingPhone: ' 0900000000 ',
    })) as CreateOrderDto;
    expect(dto.shippingRecipient).toBe('Nguyễn Văn A');
    expect(dto.shippingPhone).toBe('0900000000');
  });

  it.each([0, -1, 1.5, 101, '2', null])(
    'từ chối quantity = %p (phải là số nguyên 1..100)',
    async (quantity) => {
      const body = {
        ...validBody(),
        items: [{ productId: productA, quantity }],
      };
      await expect(run(body)).rejects.toBeInstanceOf(BadRequestException);
    },
  );

  it('báo lỗi "lớn hơn 0" khi quantity = 0', async () => {
    const body = {
      ...validBody(),
      items: [{ productId: productA, quantity: 0 }],
    };
    expect(await messagesOf(body)).toContain('quantity phải lớn hơn 0');
  });

  it('từ chối productId không phải UUID', async () => {
    const body = { ...validBody(), items: [{ productId: 'abc', quantity: 1 }] };
    await expect(run(body)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('từ chối danh sách items rỗng, thiếu hoặc quá 50 sản phẩm', async () => {
    await expect(run({ ...validBody(), items: [] })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    const noItems: Record<string, unknown> = validBody();
    delete noItems.items;
    await expect(run(noItems)).rejects.toBeInstanceOf(BadRequestException);

    const tooMany = Array.from({ length: 51 }, (_, i) => ({
      productId: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
      quantity: 1,
    }));
    await expect(
      run({ ...validBody(), items: tooMany }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('từ chối productId trùng nhau trong cùng đơn', async () => {
    const body = {
      ...validBody(),
      items: [
        { productId: productA, quantity: 1 },
        { productId: productA, quantity: 2 },
      ],
    };
    expect(await messagesOf(body)).toContain('productId bị trùng');
  });

  it('chấp nhận nhiều sản phẩm khác nhau', async () => {
    const body = {
      ...validBody(),
      items: [
        { productId: productA, quantity: 1 },
        { productId: productB, quantity: 100 },
      ],
    };
    await expect(run(body)).resolves.toBeDefined();
  });

  it.each(['abc', '12345678', '+1234567890123456', '090 000 0000'])(
    'từ chối shippingPhone = %p',
    async (shippingPhone) => {
      await expect(
        run({ ...validBody(), shippingPhone }),
      ).rejects.toBeInstanceOf(BadRequestException);
    },
  );

  it('từ chối người nhận / địa chỉ toàn khoảng trắng hoặc quá dài', async () => {
    await expect(
      run({ ...validBody(), shippingRecipient: '   ' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      run({ ...validBody(), shippingAddress: '   ' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      run({ ...validBody(), shippingRecipient: 'a'.repeat(151) }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it.each(['userId', 'totalPrice', 'warehouseId', 'unitPrice'])(
    'từ chối field không được phép từ khách: %s',
    async (field) => {
      await expect(
        run({ ...validBody(), [field]: 'x' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    },
  );

  it('từ chối field thừa trong từng dòng hàng (vd. unitPrice)', async () => {
    const body = {
      ...validBody(),
      items: [{ productId: productA, quantity: 1, unitPrice: '1.00' }],
    };
    await expect(run(body)).rejects.toBeInstanceOf(BadRequestException);
  });
});
