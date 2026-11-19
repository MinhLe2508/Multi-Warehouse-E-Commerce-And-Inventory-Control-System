import { getProductById } from "@/shared/lib/mockData";
import { getTotalStock } from "@/shared/lib/utils";
import type { Order, OrderItem, AllocatedOrderItem, PlaceOrderInput } from "@/shared/types/order";
import { trimShipping, validateShipping } from "@/shared/lib/checkout";
import { isPaymentMethod } from "@/shared/lib/storage";

/** Phí vận chuyển (mock): hiện đang miễn phí. Sau này lấy từ API. */
export const SHIPPING_FEE = 0;
/** Cấu hình demo; backend thật quản lý TTL và cron. */
export const RESERVATION_TTL_MINUTES = 15;

/**
 * Lỗi 409 Conflict: sản phẩm vừa hết hàng khi đặt đơn.
 * Khớp với phản hồi của backend khi StockReservationService không giữ chỗ được.
 */
export class OrderConflictError extends Error {
  readonly status = 409;

  constructor(
    public readonly productId: string,
    public readonly productName: string,
  ) {
    super("Sản phẩm vừa hết hàng");
    this.name = "OrderConflictError";
  }
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function generateOrderId(): string {
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const rand = String(Math.floor(Math.random() * 10000)).padStart(4, "0");
  return `MM${ymd}-${rand}`;
}

/**
 * Tương ứng POST /orders. Sau này thay thân hàm bằng axios.post(...) và
 * chuyển lỗi HTTP 409 thành OrderConflictError, các trang không cần đổi.
 *
 * - simulateConflict = true: ép lỗi 409 cho sản phẩm đầu tiên trong đơn (cờ test).
 * - Ngoài ra vẫn kiểm tra tồn kho thật trong mockData: số lượng vượt tồn -> 409.
 */
export async function placeOrder(
  input: PlaceOrderInput,
  options: { simulateConflict?: boolean } = {},
): Promise<Order> {
  await delay(900);

  if (input.items.length === 0 || !isPaymentMethod(input.payment) ||
    Object.keys(validateShipping(input.shipping)).length > 0) {
    throw new Error("Invalid order input");
  }

  if (options.simulateConflict && input.items.length > 0) {
    const first = input.items[0];
    throw new OrderConflictError(first.productId, first.name);
  }

  const snapshots = new Map<string, OrderItem>();
  for (const item of input.items) {
    if (!Number.isSafeInteger(item.quantity) || item.quantity <= 0) {
      throw new Error("Invalid quantity");
    }
    const quantity = (snapshots.get(item.productId)?.quantity ?? 0) + item.quantity;
    const product = getProductById(item.productId);
    const available = product ? getTotalStock(product) : 0;
    if (!product || !Number.isSafeInteger(quantity) || available < quantity) {
      throw new OrderConflictError(item.productId, item.name);
    }
    snapshots.set(item.productId, { productId: product.id, name: product.name, image: product.image, price: product.price, quantity });
  }

  // Snapshot theo catalog mock, không tin giá/tên do giỏ client gửi lên.
  // Phân bổ lần lượt HN → ĐN → HCM chỉ là quy tắc demo, chờ nhóm chốt thuật toán.
  const items: AllocatedOrderItem[] = [];
  for (const item of snapshots.values()) {
    const product = getProductById(item.productId);
    if (!product) throw new OrderConflictError(item.productId, item.name);
    let remaining = item.quantity;
    for (const stock of product.stockByWarehouse) {
      const quantity = Math.min(remaining, stock.quantity);
      if (quantity > 0) items.push({ ...item, quantity, warehouseId: stock.warehouseId });
      remaining -= quantity;
    }
  }
  const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  return {
    id: crypto.randomUUID(),
    orderCode: generateOrderId(),
    status: "PENDING_PAYMENT",
    paymentStatus: "PENDING",
    reservationStatus: "HOLDING",
    reservationExpiresAt: new Date(Date.now() + RESERVATION_TTL_MINUTES * 60_000).toISOString(),
    cancelledReason: null,
    transactionRef: null,
    items,
    shipping: trimShipping(input.shipping),
    payment: input.payment,
    subtotal,
    shippingFee: SHIPPING_FEE,
    total: subtotal + SHIPPING_FEE,
    createdAt: new Date().toISOString(),
  };
}

/** Các transition chỉ mô phỏng UI, không phải callback gateway hoặc reservation engine. */
export function expireMockOrder(order: Order, now = Date.now()): Order {
  if (order.status !== "PENDING_PAYMENT" || Date.parse(order.reservationExpiresAt) > now) return order;
  return { ...order, status: "CANCELLED", reservationStatus: "EXPIRED", cancelledReason: "EXPIRED" };
}

export function settleMockPayment(order: Order, result: "SUCCESS" | "FAILED", now = Date.now()): Order {
  const current = expireMockOrder(order, now);
  // Không tự quyết định nghiệp vụ COD; không chạy lại transition cho đơn đã kết thúc.
  if (current.status !== "PENDING_PAYMENT" || current.payment === "COD") return current;
  return {
    ...current,
    transactionRef: current.transactionRef ?? `MOCK-${current.id}`,
    paymentStatus: result,
    status: result === "SUCCESS" ? "CONFIRMED" : "CANCELLED",
    reservationStatus: result === "SUCCESS" ? "COMMITTED" : "RELEASED",
    cancelledReason: result === "SUCCESS" ? null : "PAYMENT_FAILED",
  };
}
