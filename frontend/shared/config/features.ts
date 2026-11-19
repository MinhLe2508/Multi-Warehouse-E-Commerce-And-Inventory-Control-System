/**
 * Cờ tính năng cho khu vực Quản trị.
 * Các tính năng có cờ `false` sẽ bị mờ nút hoặc gắn nhãn "Chờ backend"
 * để tránh hành động không mong muốn khi API chưa sẵn sàng.
 */
export const FEATURES = {
  staffWarehouseAssignment: false, // chưa có bảng nối nhân viên–kho
  chatTakeOver: false,             // chưa có người tiếp nhận phiên chat
  ragUpload: false,                // chưa có pipeline embedding
  restockRequest: false,           // chưa có bảng yêu cầu nhập kho
  warehouseTransfer: false,        // chưa có bảng điều chuyển
} as const;

export type FeatureKey = keyof typeof FEATURES;
