// Holded app deep-link builders. Document rows in the card-back link to the
// document in Holded; the internal API provides the data, these build the URLs.
const HOLDED_APP_BASE = 'https://app.holded.com';

export type HoldedDocumentType = 'sales-orders' | 'purchase-orders' | 'waybills' | 'estimates' | 'invoices';

export function buildSalesOrderUrl(id: string): string {
  return `${HOLDED_APP_BASE}/sales/orders#open:salesorder-${id}`;
}

export function buildDocumentUrl(type: HoldedDocumentType, id: string): string {
  if (type === 'sales-orders') return buildSalesOrderUrl(id);
  if (type === 'purchase-orders') return `${HOLDED_APP_BASE}/sales/orders#open:order-${id}`;
  if (type === 'estimates') return `${HOLDED_APP_BASE}/sales/estimates#open:estimate-${id}`;
  if (type === 'invoices') return `${HOLDED_APP_BASE}/sales/revenue#open:invoice-${id}`;
  return `${HOLDED_APP_BASE}/sales/waybills#open:waybill-${id}`;
}
