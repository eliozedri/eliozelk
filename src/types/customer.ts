export interface Customer {
  id: string;
  name: string;
  location: string;
  phone: string;
  lastOrder: string;
  notes?: string;
  paymentTerms?: string;  // e.g. "שוטף + 30", "מזומן", "60 יום"
  contactPerson?: string;
  contactEmail?: string;
  contactPhone?: string;
  address?: string;
  openBalance?: number;
  billingNotes?: string;
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
  contactPerson?: string;
  contactEmail?: string;
  contactPhone?: string;
  address?: string;
  openBalance?: number;
  billingNotes?: string;
}

export type CustomerErrors = Partial<Record<keyof CustomerFormState, string>>;
