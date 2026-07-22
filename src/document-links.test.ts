import { describe, expect, it } from 'vitest';
import { buildElectricaferrerDocumentUrl, buildElectricaferrerEntityUrl } from './document-links';

describe('Eléctrica Ferrer document links', () => {
  it.each([
    ['sales-orders', 'sales order/id', 'https://app.electricaferrer.es/pedido/sales%20order%2Fid'],
    ['waybills', 'waybill-1', 'https://app.electricaferrer.es/albaran/waybill-1'],
    ['purchase-orders', 'purchase-1', 'https://app.electricaferrer.es/pedido-compra/purchase-1'],
    ['estimates', 'estimate-1', 'https://app.electricaferrer.es/presupuesto/editar/estimate-1'],
  ])('builds the %s destination from the immutable document ID', (type, id, expected) => {
    expect(buildElectricaferrerDocumentUrl(type, id)).toBe(expected);
  });

  it('does not offer an Eléctrica Ferrer destination for invoices', () => {
    expect(buildElectricaferrerDocumentUrl('invoices', 'invoice-1')).toBeNull();
  });

  it('does not build links without an immutable document ID', () => {
    expect(buildElectricaferrerDocumentUrl('sales-orders', '  ')).toBeNull();
  });
});

describe('Eléctrica Ferrer entity links', () => {
  it.each([
    ['contact', 'contact / 1', 'https://app.electricaferrer.es/contacto/contact%20%2F%201'],
    ['project', 'project-1', 'https://app.electricaferrer.es/proyecto/project-1'],
  ])('builds the %s destination from the immutable entity ID', (type, id, expected) => {
    expect(buildElectricaferrerEntityUrl(type, id)).toBe(expected);
  });
});
