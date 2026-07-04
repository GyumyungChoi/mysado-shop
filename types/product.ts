/** 상품 데이터 타입 */
export interface Product {
  id: string;
  origin_product_no: number;
  channel_product_no: number;
  sku: string;
  category_id: string;
  category_name: string;
  name: string;
  price: number;
  discounted_price: number | null;
  stock_quantity: number;
  description: string;
  images: string[];
  brand: string;
  tags: string[];
  is_active: boolean;
  smartstore_url: string;
  sort_order: number;
  created_at: string;
}

/** 카테고리 데이터 타입 */
export interface Category {
  id: string;
  name: string;
  slug: string;
  sort_order: number;
}
