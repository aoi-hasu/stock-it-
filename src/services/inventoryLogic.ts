/**
 * Business logic for Products and Inventory management.
 * Isolated from UI components per architectural guidelines.
 */

export type ProductType = 'raw material' | 'finished' | 'trading';
export type StockStatus = 'In Stock' | 'Low Stock' | 'Out of Stock';
export type AdjustmentType = 'add' | 'remove' | 'set';
export type AdjustmentReason = 'damaged' | 'recount' | 'returned' | 'other' | 'opening' | 'order';

export interface StockHistoryEntry {
  id: string;
  date: string;
  type: AdjustmentType;
  change: number; // positive or negative
  reason: AdjustmentReason;
  previousBalance: number;
  newBalance: number;
  note?: string;
  user?: string;
}

export interface InventoryProduct {
  id: string;
  name: string;
  category: string;
  type: ProductType;
  unit: string;
  price: number;
  gstRate: number; // 0, 5, 12, 18, 28
  currentStock: number;
  openingStock: number;
  reorderLevel: number;
  stockHistory: StockHistoryEntry[];
  description?: string;
  modelNumber?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProductInput {
  name: string;
  category: string;
  type: ProductType;
  unit: string;
  price: number;
  gstRate: number;
  openingStock?: number;
  currentStock?: number;
  reorderLevel: number;
  description?: string;
  modelNumber?: string;
}

export interface StockAdjustmentInput {
  productId: string;
  type: AdjustmentType;
  quantity: number;
  reason: AdjustmentReason;
  note?: string;
  user?: string;
}

export interface OrderReference {
  id: string;
  orderNumber: string;
  customerName: string;
  date: string;
  status: string;
  items: Array<{
    productId: string;
    productName: string;
    quantity: number;
    unitPrice: number;
    totalAmount: number;
  }>;
}

/**
 * Determine the stock status based on current stock and reorder level.
 */
export function getStockStatus(currentStock: number, reorderLevel: number): StockStatus {
  if (currentStock <= 0) {
    return 'Out of Stock';
  }
  if (currentStock <= reorderLevel) {
    return 'Low Stock';
  }
  return 'In Stock';
}

/**
 * Check if a product is considered low stock (greater than 0, but at or below reorder level).
 */
export function isLowStock(currentStock: number, reorderLevel: number): boolean {
  return currentStock > 0 && currentStock <= reorderLevel;
}

/**
 * Check if a product is at or below its reorder level (including out of stock).
 */
export function isAtOrBelowReorder(currentStock: number, reorderLevel: number): boolean {
  return currentStock <= reorderLevel;
}

/**
 * Check if a product is completely out of stock (<= 0).
 */
export function isOutOfStock(currentStock: number): boolean {
  return currentStock <= 0;
}

/**
 * Calculate stock valuation for a single product (current stock × price).
 */
export function calculateStockValue(currentStock: number, price: number): number {
  const stock = Math.max(0, Number(currentStock) || 0);
  const p = Math.max(0, Number(price) || 0);
  return Math.round(stock * p * 100) / 100;
}

/**
 * Calculate total stock valuation across an array of products.
 */
export function calculateTotalStockValue(products: Array<{ currentStock: number; price: number }>): number {
  return products.reduce((acc, p) => acc + calculateStockValue(p.currentStock, p.price), 0);
}

/**
 * Calculate aggregated inventory metrics for dashboard & summary cards.
 */
export function calculateInventoryMetrics(products: InventoryProduct[]): {
  totalProducts: number;
  totalStockValue: number;
  lowStockCount: number;
  outOfStockCount: number;
  inStockCount: number;
} {
  let totalStockValue = 0;
  let lowStockCount = 0;
  let outOfStockCount = 0;
  let inStockCount = 0;

  for (const p of products) {
    totalStockValue += calculateStockValue(p.currentStock, p.price);
    const status = getStockStatus(p.currentStock, p.reorderLevel);
    if (status === 'Out of Stock') {
      outOfStockCount++;
    } else if (status === 'Low Stock') {
      lowStockCount++;
    } else {
      inStockCount++;
    }
  }

  return {
    totalProducts: products.length,
    totalStockValue,
    lowStockCount,
    outOfStockCount,
    inStockCount,
  };
}

/**
 * Calculate the new stock balance and change amount for an adjustment.
 * Enforces rule: stock can never go below zero.
 */
export function calculateNewStock(
  currentStock: number,
  adjustmentType: AdjustmentType,
  quantity: number
): {
  success: boolean;
  newBalance: number;
  change: number;
  error?: string;
} {
  const curr = Math.max(0, Number(currentStock) || 0);
  const qty = Number(quantity);

  if (isNaN(qty) || qty < 0) {
    return {
      success: false,
      newBalance: curr,
      change: 0,
      error: 'Adjustment quantity cannot be negative or invalid.',
    };
  }

  if (adjustmentType === 'add') {
    return {
      success: true,
      newBalance: curr + qty,
      change: qty,
    };
  }

  if (adjustmentType === 'remove') {
    if (curr - qty < 0) {
      return {
        success: false,
        newBalance: curr,
        change: 0,
        error: `Cannot remove ${qty} units. Current stock is only ${curr} units (stock cannot go below zero).`,
      };
    }
    return {
      success: true,
      newBalance: curr - qty,
      change: -qty,
    };
  }

  if (adjustmentType === 'set') {
    if (qty < 0) {
      return {
        success: false,
        newBalance: curr,
        change: 0,
        error: 'Stock quantity cannot be set below zero.',
      };
    }
    return {
      success: true,
      newBalance: qty,
      change: qty - curr,
    };
  }

  return {
    success: false,
    newBalance: curr,
    change: 0,
    error: 'Invalid adjustment type specified.',
  };
}

/**
 * Validate product form input fields before creating or updating.
 */
export function validateProductInput(input: Partial<ProductInput>): {
  isValid: boolean;
  errors: Record<string, string>;
} {
  const errors: Record<string, string> = {};

  if (!input.name || !input.name.trim()) {
    errors.name = 'Product name is required.';
  }

  if (input.price === undefined || input.price === null || isNaN(Number(input.price))) {
    errors.price = 'Price is required.';
  } else if (Number(input.price) < 0) {
    errors.price = 'Price cannot be negative.';
  }

  if (input.currentStock !== undefined && Number(input.currentStock) < 0) {
    errors.currentStock = 'Current stock cannot be negative.';
  }

  if (input.openingStock !== undefined && Number(input.openingStock) < 0) {
    errors.openingStock = 'Opening stock cannot be negative.';
  }

  if (input.reorderLevel !== undefined && Number(input.reorderLevel) < 0) {
    errors.reorderLevel = 'Reorder level cannot be negative.';
  }

  const validGst = [0, 5, 12, 18, 28];
  if (input.gstRate !== undefined && !validGst.includes(Number(input.gstRate))) {
    errors.gstRate = 'GST rate must be 0%, 5%, 12%, 18%, or 28%.';
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}

/**
 * Check whether a product is eligible for deletion.
 * A product used in any existing order CANNOT be deleted.
 */
export function canDeleteProduct(
  productId: string,
  orders: OrderReference[]
): {
  canDelete: boolean;
  reason?: string;
  linkedOrderNumber?: string;
} {
  for (const order of orders) {
    const hasItem = (order.items || []).some(item => item.productId === productId);
    if (hasItem) {
      return {
        canDelete: false,
        reason: `This product cannot be deleted because it is used in Order #${order.orderNumber} (${order.customerName}). Products linked to historical transactions must be preserved for audit consistency.`,
        linkedOrderNumber: order.orderNumber,
      };
    }
  }

  return {
    canDelete: true,
  };
}
