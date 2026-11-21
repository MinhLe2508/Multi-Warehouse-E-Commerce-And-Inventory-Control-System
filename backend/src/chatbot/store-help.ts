import { getVietQrRecipient } from '../payments/vietqr-config';

function fold(message: string) {
  return message
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function getStoreHelpReply(message: string): string | null {
  const text = fold(message);

  if (
    /^(?:(?:xin )?chao|hello|hi|hey)(?: (?:ban|shop|tro ly|multimart|em|anh|chi|a|nhe))*$/.test(
      text,
    ) ||
    /^(?:shop|ban|tro ly) oi$/.test(text)
  ) {
    return 'Chào bạn! Mình có thể giúp tìm sản phẩm, kiểm tra còn hàng, hướng dẫn đặt hàng hoặc tra cứu đơn. Bạn đang muốn tìm gì?';
  }
  if (
    /^(?:cam on|thanks|thank you)(?: (?:ban|shop|tro ly|em|a|nhe))*$/.test(text)
  ) {
    return 'Rất vui được giúp bạn! Nếu cần tìm thêm sản phẩm hoặc xem đơn hàng, cứ nhắn mình nhé.';
  }
  if (
    /\b(huy|cancel)\b.*\b(don|order)\b|\bdon\b.*\b(cach huy|huy the nao)\b/.test(
      text,
    )
  ) {
    return 'Mở **Đơn hàng của tôi**, chọn đơn cần xem rồi bấm **Hủy đơn** nếu đơn còn chờ thanh toán và còn thời gian giữ hàng. Với đơn đã xác nhận, hãy chọn **Gặp nhân viên** để được hỗ trợ.';
  }
  if (
    /\b(thanh toan|payment|chuyen khoan|vietqr|quet (?:ma )?qr|cod|tra tien|tra khi nhan|vi dien tu|momo|zalopay|the (?:tin dung|ngan hang))\b/.test(
      text,
    ) &&
    !/\b(sai so tien|thieu tien|thua tien|sai noi dung|noi dung chuyen khoan|ma giao dich|doi phuong thuc|het han|khong quet duoc|khong hien thi|hoan tien)\b/.test(text) &&
    !/\bord-[a-z0-9]+\b/i.test(message)
  ) {
    if (
      /\b(da thanh toan|da chuyen|thanh toan roi|chuyen tien roi|chuyen khoan roi|doi soat)\b/.test(
        text,
      )
    ) {
      return 'Mở chi tiết đơn trong **Đơn hàng của tôi** để cập nhật trạng thái. Nếu đã chuyển tiền mà đơn vẫn chờ lâu, chọn **Gặp nhân viên** và cung cấp mã đơn cùng mã giao dịch ngân hàng.';
    }
    return getVietQrRecipient()
      ? 'Bạn có thể chọn **COD** để trả khi nhận hàng, hoặc **Chuyển khoản VietQR**. Khi đặt đơn VietQR, chi tiết đơn sẽ có mã QR chứa số tiền và nội dung chuyển khoản riêng. Trạng thái cập nhật sau khi khoản tiền được đối soát.'
      : 'Bạn có thể chọn **Thanh toán khi nhận hàng (COD)** và trả cho nhân viên giao hàng. Các phương thức đang mở được hiển thị tại bước đặt hàng.';
  }
  if (
    /\b(lam (?:the nao|sao) de (?:xem|theo doi|tra cuu) don|cach (?:tra cuu|theo doi|xem) don|huong dan (?:tra cuu|theo doi) don)\b/.test(
      text,
    )
  ) {
    return 'Đăng nhập, mở **Đơn hàng của tôi** rồi chọn đơn muốn xem. Bạn sẽ thấy trạng thái, lịch sử xử lý và thông tin giao hàng.';
  }
  if (
    /\b(cach (?:mua|dat hang)|huong dan (?:mua|dat hang)|dat hang (?:the nao|ra sao|nhu the nao)|lam (?:the nao|sao) de (?:mua|dat hang)|mua hang nhu the nao)\b/.test(
      text,
    )
  ) {
    return 'Chọn sản phẩm và bấm **Thêm vào giỏ** hoặc **Mua ngay**. Sau khi đăng nhập, điền thông tin nhận hàng, chọn phương thức thanh toán và kiểm tra tổng tiền trước khi đặt.';
  }
  if (
    /\b(doi|quen|dat lai|tao|thiet lap) mat khau\b|\b(dang ky|tao) tai khoan\b|\bxac thuc (?:email|gmail)\b/.test(
      text,
    )
  ) {
    return /\b(quen|dat lai|doi) mat khau\b/.test(text)
      ? 'Chọn **Quên mật khẩu?** trên trang đăng nhập và mở liên kết gửi tới Gmail đã đăng ký. Nếu vẫn đang đăng nhập, bạn có thể đổi mật khẩu trong trang tài khoản.'
      : 'Chọn **Tạo tài khoản**, nhập Gmail và họ tên. Mở Email xác thực từ MultiMart để tạo mật khẩu, rồi đăng nhập bằng Gmail hoặc tên đăng nhập.';
  }
  if (/\b(phi van chuyen|phi giao hang|tinh phi ship)\b/.test(text)) {
    return 'Phí giao hàng được hiển thị trong tóm tắt đơn. Tổng tiền chính xác được tính khi hệ thống xác nhận đơn theo sản phẩm và địa chỉ nhận hàng.';
  }
  return null;
}

export const NEED_MORE_CONTEXT =
  'Mình chưa tìm thấy thông tin để trả lời chính xác. Bạn có thể nói rõ sản phẩm, mã SKU hoặc nội dung muốn hỏi không? Nếu cần hỗ trợ riêng, hãy chọn **Gặp nhân viên**.';
