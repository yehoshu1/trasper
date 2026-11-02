export interface SearchQuotation {
  id: string;
  number: string;
  referenceNo: string;
  status: string;
  issueDate: string;
  customerName: string;
}

export interface SearchItinerary {
  id: string;
  number: string;
  customerName: string;
  issuedAt: string;
}

export interface SearchProforma {
  id: string;
  number: string;
  customerName: string;
  status: string;
  issueDate: string;
}

export interface SearchCustomer {
  id: string;
  name: string;
  email: string;
  city: string;
  archived: boolean;
}

export interface SearchPassenger {
  id: string;
  firstName: string;
  lastName: string;
  type: string;
}

export interface GlobalSearchResults {
  quotations: SearchQuotation[];
  itineraries: SearchItinerary[];
  proformas: SearchProforma[];
  customers: SearchCustomer[];
  passengers: SearchPassenger[];
  total: number;
}

export const EMPTY_SEARCH_RESULTS: GlobalSearchResults = {
  quotations: [],
  itineraries: [],
  proformas: [],
  customers: [],
  passengers: [],
  total: 0,
};
