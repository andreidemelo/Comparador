
export interface Product {
  id: string;
  name: string;
  quantity: number;
  category: string;
}

export interface StorePrice {
  storeName: string;
  price: number;
  productName: string;
  url?: string;
}

export interface ComparisonResult {
  storeName: string;
  totalPrice: number;
  items: StorePrice[];
  isCheapest?: boolean;
}

export interface UserCredentials {
  name: string;
  password?: string;
}
