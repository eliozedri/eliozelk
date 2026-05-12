export interface Customer {
  id: string;
  name: string;
  location: string;
  phone: string;
  lastOrder: string;
  notes?: string;
  paymentTerms?: string;  // e.g. "שוטף + 30", "מזומן", "60 יום"
  createdAt: string;
  updatedAt: string;
}

export interface CustomerFormState {
  name: string;
  location: string;
  phone: string;
  lastOrder: string;
  notes?: string;
  paymentTerms?: string;
}

export type CustomerErrors = Partial<Record<keyof CustomerFormState, string>>;
