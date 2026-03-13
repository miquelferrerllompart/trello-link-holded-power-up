// ── Holded API types (based on real API responses) ──

/** Address object used in billAddress */
export interface HoldedAddress {
  address: string | null;
  city: string | null;
  postalCode: string;
  province: string | null;
  country: string;
  countryCode: string;
  info: string;
}

/** Shipping address as returned by the API */
export interface HoldedShippingAddress {
  shippingId: string;
  name: string;
  address: string;
  city: string;
  postalCode: string;
  province: string;
  country: string;
  countryCode: string;
  notes: string;
  privateNotes: string;
}

/** Record reference (client or supplier) */
export interface HoldedRecord {
  num: number;
  name: string;
}

/** Contact defaults for invoicing */
export interface HoldedContactDefaults {
  salesChannel: string | number;
  expensesAccount: number;
  dueDays: number;
  paymentDay: number;
  paymentMethod: string | number;
  discount: number;
  language: string;
  currency: string;
  salesTax: string[];
  purchasesTax: string[];
  accumulateInForm347: string;
}

/** Full contact as returned by GET /api/invoicing/v1/contacts */
export interface HoldedContact {
  id: string;
  customId: string | null;
  name: string;
  code: string | null;
  vatnumber: string;
  tradeName: string | null;
  email: string | null;
  mobile: string | null;
  phone: string | null;
  type: string;
  iban: string;
  swift: string;
  groupId: string;
  clientRecord: HoldedRecord | number;
  supplierRecord: HoldedRecord | number;
  billAddress: HoldedAddress;
  customFields: unknown[];
  defaults: HoldedContactDefaults;
  socialNetworks: { website: string } | unknown[];
  tags: string[];
  notes: unknown[];
  contactPersons: unknown[];
  shippingAddresses: HoldedShippingAddress[];
  /** 1 = persona, 0 = empresa */
  isperson: number;
  createdAt: number;
  updatedAt: number;
  updatedHash?: string;
}

/** Payload for POST /api/invoicing/v1/contacts */
export interface CreateContactPayload {
  name: string;
  /** DNI / CIF — maps to the `code` field in the contact */
  code: string;
  /** 1 = persona, 0 = empresa */
  isperson: number;
  tradeName?: string;
  email?: string;
  mobile?: string;
  phone?: string;
  vatnumber?: string;
  type?: string;
  billAddress?: {
    address?: string;
    city?: string;
    postalCode?: string;
    province?: string;
    country?: string;
    countryCode?: string;
  };
  /** Creates a note attached to the contact */
  note?: string;
}

/** Response from POST /api/invoicing/v1/contacts */
export interface CreateContactResponse {
  status: number;
  info: string;
  id: string;
}

// ── Holded Projects ──

export interface HoldedProject {
  id: string;
  name: string;
  status?: string;
}

// ── Power-Up internal data ──

export interface CardHoldedData {
  contactId?: string;
  contactName?: string;
  /** Short label for the selected address (shipping name or "street, city") */
  addressLabel?: string;
  projectId?: string;
  projectName?: string;
}

/** Temporary data stored while the address selection popup is open */
export interface PendingContactSelection {
  contactId: string;
  contactName: string;
  billAddress: HoldedAddress;
  shippingAddresses: HoldedShippingAddress[];
}

// ── Trello Power-Up SDK types ──

export interface TrelloPowerUp {
  initialize(capabilities: Record<string, unknown>, options?: { appKey?: string; appName?: string }): void;
  iframe(options?: { appKey?: string; appName?: string }): TrelloContext;
}

export interface TrelloContext {
  set(scope: string, visibility: string, key: string, value: unknown): Promise<void>;
  get(scope: string, visibility: string, key: string): Promise<unknown>;
  remove(scope: string, visibility: string, key: string): Promise<void>;
  popup(options: {
    title: string;
    url: string;
    height?: number;
  }): void;
  closePopup(): void;
  sizeTo(selector: string | HTMLElement): Promise<void>;
  arg(name: string, defaultValue?: string): string;
  signUrl(url: string): string;
  card(...fields: string[]): Promise<{ id: string; desc: string; [key: string]: unknown }>;
  board(...fields: string[]): Promise<{ id: string; name: string; [key: string]: unknown }>;
  member(...fields: string[]): Promise<{ id: string; fullName: string; username: string; [key: string]: unknown }>;
  getRestApi(): TrelloRestApi;
}

export interface TrelloRestApi {
  authorize(opts: { expiration: string; scope: string }): Promise<void>;
  isAuthorized(): Promise<boolean>;
  getToken(): Promise<string | null>;
}

declare global {
  interface Window {
    TrelloPowerUp: TrelloPowerUp;
  }
}
