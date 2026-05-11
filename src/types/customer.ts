export interface Customer {
  id: string;
  name: string;
  location: string;
  phone: string;
  lastOrder: string;
  createdAt: string;
  updatedAt: string;
}

export interface CustomerFormState {
  name: string;
  location: string;
  phone: string;
  lastOrder: string;
}

export type CustomerErrors = Partial<Record<keyof CustomerFormState, string>>;
