/** 상품 데이터 타입 (v2) */
export interface Product {
  id: string;
  origin_product_no: string;      // v2: number → string
  channel_product_no: string;     // v2: number → string
  sku: string | null;             // v2: null 허용
  category_id: string;
  category_name: string;
  name: string;
  price: number;
  discounted_price: number | null;
  stock_quantity: number;
  status: string;                 // SALE / OUTOFSTOCK / SUSPENSION
  description: string;
  detail_html: string;
  images: string[];
  brand: string;
  manufacturer_name: string;
  model_name: string;
  tags: string[];
  is_active: boolean;
  delivery_fee: number;
  return_fee: number;
  exchange_fee: number;
  smartstore_url: string;
  sort_order: number;
  created_at: string;             // 스토어 등록일
}

/** 카테고리 데이터 타입 */
export interface Category {
  id: string;
  name: string;
  slug: string;
  sort_order: number;
}
