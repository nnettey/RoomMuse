export type Route = "home" | "capture" | "style" | "generating" | "result" | "shopping";

export type DesignStyle = {
  id: string;
  name: string;
  subtitle: string;
  colors: [string, string, string];
  icon: string;
};

export type ShoppingItem = {
  id: string;
  name: string;
  category: string;
  description: string;
  quantity: number;
  unitPrice: number;
  retailer: string;
  purchaseUrl: string;
  checked?: boolean;
};

export type DesignConcept = {
  id: string;
  title: string;
  summary: string;
  style: string;
  palette: string[];
  principles: string[];
  beforeImageUrl?: string;
  imageDataUrl?: string;
  shoppingItems: ShoppingItem[];
};
