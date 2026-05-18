export interface SapODataResponse<T> {
  "odata.metadata"?: string;
  value: T[];
  "odata.count"?: number;
}

export interface SapDocumentLine {
  LineNum: number;
  ItemCode: string;
  ItemDescription: string;
  Quantity: number;
  UnitPrice: number;
  LineTotal: number;
  WarehouseCode?: string;
  TaxCode?: string;
}

export interface SapBusinessPartner {
  CardCode: string;
  CardName: string;
  CardType: "cCustomer" | "cSupplier" | "cLead";
  Phone1?: string;
  Phone2?: string;
  Cellular?: string;
  EmailAddress?: string;
  Website?: string;
  FaxNumber?: string;
  Balance?: number;
  CreditLimit?: number;
  Currency?: string;
  FederalTaxID?: string;
  BillToCity?: string;
  BillToCountry?: string;
  ContactPerson?: string;
  CreateDate?: string;
  UpdateDate?: string;
  Frozen?: "tYES" | "tNO";
}

export interface SapItem {
  ItemCode: string;
  ItemName: string;
  ForeignName?: string;
  ItemType?: string;
  ItemsGroupCode?: number;
  QuantityOnStock?: number;
  QuantityOrderedFromVendors?: number;
  QuantityOrderedByCustomers?: number;
  ManageStockByWarehouse?: "tYES" | "tNO";
  PurchaseItem?: "tYES" | "tNO";
  SalesItem?: "tYES" | "tNO";
  InventoryItem?: "tYES" | "tNO";
  BarCode?: string;
  ItemWarehouseInfoCollection?: Array<{
    WarehouseCode: string;
    InStock: number;
    Committed: number;
    Ordered: number;
    MinimalStock: number;
  }>;
  UpdateDate?: string;
  CreateDate?: string;
}

export interface SapWarehouse {
  WarehouseCode: string;
  WarehouseName: string;
  Street?: string;
  City?: string;
  Country?: string;
  ZipCode?: string;
  Inactive?: "tYES" | "tNO";
  DropShip?: "tYES" | "tNO";
}

export interface SapSalesOrder {
  DocEntry: number;
  DocNum: number;
  DocDate: string;
  DocDueDate?: string;
  CardCode: string;
  CardName: string;
  NumAtCard?: string;
  DocCurrency?: string;
  DocTotal: number;
  VatSum?: number;
  PaidToDate?: number;
  DocumentStatus?: "bost_Open" | "bost_Close" | "bost_Paid" | "bost_Cancel";
  Cancelled?: "tYES" | "tNO";
  DocumentLines?: SapDocumentLine[];
  Comments?: string;
  UpdateDate?: string;
  CreateDate?: string;
}

export type SapInvoice = SapSalesOrder & {
  DueDate?: string;
  JournalMemo?: string;
};

export type SapCreditNote = SapInvoice;

export type SapDeliveryNote = Omit<SapSalesOrder, "PaidToDate">;

export interface SapIncomingPayment {
  DocEntry: number;
  DocNum?: number;
  CardCode: string;
  CardName?: string;
  DocDate: string;
  CashSum?: number;
  TransferSum?: number;
  CheckSum?: number;
  DocTotal: number;
  DocCurrency?: string;
  Cancelled?: "tYES" | "tNO";
  UpdateDate?: string;
}
