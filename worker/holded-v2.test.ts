import { describe, expect, it } from 'vitest';
import { buildDocumentUrl, buildSalesOrderUrl } from './holded-v2';

describe('Holded deep-link builders', () => {
  it('builds the sales-order open URL', () => {
    expect(buildSalesOrderUrl('6a4f586ee48789d09401f3e6'))
      .toBe('https://app.holded.com/sales/orders#open:salesorder-6a4f586ee48789d09401f3e6');
  });

  it('builds per-type document URLs', () => {
    expect(buildDocumentUrl('sales-orders', 'so-1'))
      .toBe('https://app.holded.com/sales/orders#open:salesorder-so-1');
    expect(buildDocumentUrl('purchase-orders', 'po-1'))
      .toBe('https://app.holded.com/sales/orders#open:order-po-1');
    expect(buildDocumentUrl('estimates', 'est-1'))
      .toBe('https://app.holded.com/sales/estimates#open:estimate-est-1');
    expect(buildDocumentUrl('waybills', 'wb-1'))
      .toBe('https://app.holded.com/sales/waybills#open:waybill-wb-1');
  });
});
