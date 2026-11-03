'use client';

import { useState, useCallback, useMemo } from 'react';
import { useCurrentAdminUser } from './useCurrentAdminUser';

export interface AdminProductItem {
  id: string;
  sku: string;
  name: string;
  slug: string;
  categoryId: string | null;
  categoryName: string;
  costPrice?: number | null; // CHỈ Admin nhìn thấy, Staff không bao giờ nhận costPrice
  basePrice: number;
  discountPercent: number;
  imageUrl?: string | null;
  description?: string | null;
  isActive: boolean;
  createdAt: string;
}

const INITIAL_MOCK_PRODUCTS: AdminProductItem[] = [
  {
    id: 'prod-001',
    sku: 'MWH-IP15-128',
    name: 'Điện thoại iPhone 15 128GB',
    slug: 'iphone-15-128gb',
    categoryId: 'cat-phones',
    categoryName: 'Điện thoại & Tablet',
    costPrice: 17500000,
    basePrice: 21990000,
    discountPercent: 5,
    imageUrl: 'https://images.unsplash.com/photo-1510557880182-3d4d3cba35a5?w=100&auto=format&fit=crop&q=60',
    description: 'iPhone 15 phiên bản 128GB chính hãng VN/A',
    isActive: true,
    createdAt: '2026-03-01T08:00:00.000Z',
  },
  {
    id: 'prod-002',
    sku: 'MWH-SAM-S24',
    name: 'Samsung Galaxy S24 Ultra 256GB',
    slug: 'samsung-galaxy-s24-ultra',
    categoryId: 'cat-phones',
    categoryName: 'Điện thoại & Tablet',
    costPrice: 23000000,
    basePrice: 29990000,
    discountPercent: 10,
    imageUrl: 'https://images.unsplash.com/photo-1610945415295-d9bbf067e59c?w=100&auto=format&fit=crop&q=60',
    description: 'Samsung Galaxy S24 Ultra trang bị Galaxy AI đỉnh cao',
    isActive: true,
    createdAt: '2026-03-05T09:30:00.000Z',
  },
  {
    id: 'prod-003',
    sku: 'MWH-MAC-M3',
    name: 'MacBook Pro 14 M3 512GB Space Gray',
    slug: 'macbook-pro-14-m3',
    categoryId: 'cat-laptops',
    categoryName: 'Laptop & Máy tính',
    costPrice: 33000000,
    basePrice: 39990000,
    discountPercent: 0,
    imageUrl: 'https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=100&auto=format&fit=crop&q=60',
    description: 'MacBook Pro 14 inch chip Apple M3 mạnh mẽ',
    isActive: true,
    createdAt: '2026-03-10T14:15:00.000Z',
  },
  {
    id: 'prod-004',
    sku: 'MWH-AIR-PRO2',
    name: 'Tai nghe Apple AirPods Pro 2 USB-C',
    slug: 'airpods-pro-2-usbc',
    categoryId: 'cat-audio',
    categoryName: 'Âm thanh & Phụ kiện',
    costPrice: 4200000,
    basePrice: 5690000,
    discountPercent: 8,
    imageUrl: 'https://images.unsplash.com/photo-1600294037681-c80b4cb5b434?w=100&auto=format&fit=crop&q=60',
    description: 'Tai nghe chống ồn chủ động AirPods Pro thế hệ 2 cổng sạc Type-C',
    isActive: false,
    createdAt: '2026-03-12T16:00:00.000Z',
  },
];

// TODO(API): Thay thế mock bằng API /admin/products khi có người nhận viết (Xem mục 4 AGENT BRIEF v2)
export function useAdminProducts() {
  const { isAdmin } = useCurrentAdminUser();
  const [products, setProducts] = useState<AdminProductItem[]>(INITIAL_MOCK_PRODUCTS);
  const [loading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // STAFF tuyệt đối không nhận costPrice theo mục 0 & T8
  const visibleProducts = useMemo(() => {
    return products.map(p => {
      if (!isAdmin) {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { costPrice, ...staffSafeItem } = p;
        return staffSafeItem as AdminProductItem;
      }
      return p;
    });
  }, [products, isAdmin]);

  const addProduct = useCallback(
    async (item: Omit<AdminProductItem, 'id' | 'createdAt'>) => {
      const newProduct: AdminProductItem = {
        ...item,
        id: `prod-${Date.now()}`,
        createdAt: new Date().toISOString(),
      };
      setProducts(prev => [newProduct, ...prev]);
      return { success: true };
    },
    []
  );

  const updateProduct = useCallback(
    async (id: string, updates: Partial<AdminProductItem>) => {
      setProducts(prev =>
        prev.map(p => (p.id === id ? { ...p, ...updates } : p))
      );
      return { success: true };
    },
    []
  );

  const toggleProductActive = useCallback(async (id: string) => {
    setProducts(prev =>
      prev.map(p => (p.id === id ? { ...p, isActive: !p.isActive } : p))
    );
  }, []);

  const deleteProduct = useCallback(
    async (id: string) => {
      const prod = products.find(p => p.id === id);
      // Mô phỏng ràng buộc DB 409 (nếu sản phẩm nằm trong đơn hàng mẫu MWH-IP15-128)
      if (prod?.sku === 'MWH-IP15-128') {
        const conflictErr =
          'Sản phẩm đã có trong đơn hàng, không thể xóa. Bạn có thể ẩn sản phẩm thay thế.';
        setError(conflictErr);
        return { success: false, error: conflictErr, status: 409 };
      }

      setProducts(prev => prev.filter(p => p.id !== id));
      setError(null);
      return { success: true };
    },
    [products]
  );

  return {
    products: visibleProducts,
    loading,
    error,
    setError,
    addProduct,
    updateProduct,
    toggleProductActive,
    deleteProduct,
  };
}

