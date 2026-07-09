import { describe, expect, it } from 'vitest';
import {
  getDocumentStatusPills,
  getSalesOrderShipmentPill,
  getSalesOrderStatusLabel,
  getWaybillStatusPill,
} from './sales-order-display';

describe('sales order display labels', () => {
  it('maps Holded sales order statuses to Spanish labels', () => {
    expect(getSalesOrderStatusLabel('pending')).toBe('Pendiente');
    expect(getSalesOrderStatusLabel('completed')).toBe('Completado');
    expect(getSalesOrderStatusLabel('partial')).toBe('Parcial');
    expect(getSalesOrderStatusLabel('cancelled')).toBe('Cancelado');
    expect(getSalesOrderStatusLabel('failed')).toBe('Fallido');
    expect(getSalesOrderStatusLabel('overdue')).toBe('Vencido');
    expect(getSalesOrderStatusLabel('custom')).toBe('custom');
  });

  it('derives sales order preparation from shipped item quantities', () => {
    expect(getSalesOrderShipmentPill({
      count: 1,
      fields: ['pending', 'sent', 'total'],
      items: [{ total: 4, sent: 0, pending: 4 }],
    })).toEqual({ label: 'Pendiente', className: 'pending' });

    expect(getSalesOrderShipmentPill({
      count: 2,
      fields: ['pending', 'sent', 'total'],
      items: [{ total: 10, sent: 2, pending: 8 }, { total: 2, sent: 2, pending: 0 }],
    })).toEqual({ label: 'Parcial', className: 'partial' });

    expect(getSalesOrderShipmentPill({
      count: 1,
      fields: ['pending', 'sent', 'total'],
      items: [{ total: 4, sent: 4, pending: 0 }],
    })).toEqual({ label: 'Preparado', className: 'served' });
  });

  it('treats negative shipment quantities from abonos as prepared movement', () => {
    expect(getSalesOrderShipmentPill({
      count: 1,
      fields: ['pending', 'sent', 'total'],
      items: [{ total: -4, sent: -4, pending: 0 }],
    })).toEqual({ label: 'Preparado', className: 'served' });

    expect(getSalesOrderShipmentPill({
      count: 1,
      fields: ['pending', 'sent', 'total'],
      items: [{ total: 4, sent: 8, pending: -4 }],
    })).toEqual({ label: 'Preparado', className: 'served' });
  });

  it('flags missing sales order shipment data for review', () => {
    expect(getSalesOrderShipmentPill(undefined)).toEqual({ label: 'Sin datos envío', className: 'review' });
  });

  it('maps waybill statuses to the warehouse wording', () => {
    expect(getWaybillStatusPill('pending')).toEqual({ label: 'Pendiente', className: 'pending' });
    expect(getWaybillStatusPill('completed')).toEqual({ label: 'Aceptado', className: 'served' });
    expect(getWaybillStatusPill('cancelled')).toEqual({ label: 'Cancelado', className: 'cancelled' });
  });

  it('uses document-specific status rules', () => {
    expect(getDocumentStatusPills({
      type: 'sales-orders',
      status: 'completed',
      shippedItems: {
        count: 1,
        fields: ['pending', 'sent', 'total'],
        items: [{ total: 1, sent: 1, pending: 0 }],
      },
    })).toEqual([{ label: 'Preparado', className: 'served' }]);

    expect(getDocumentStatusPills({ type: 'waybills', status: 'completed' })).toEqual([
      { label: 'Aceptado', className: 'served' },
    ]);

    expect(getDocumentStatusPills({ type: 'purchase-orders', status: 'completed' })).toEqual([
      { label: 'Completado', className: 'served' },
    ]);
  });
});
