import { describe, expect, it } from 'vitest';
import {
  getDocumentStatusPill,
  getEstimateStatusPill,
  getPurchaseOrderStatusPill,
  getSalesOrderStatusPill,
  getWaybillStatusPill,
} from './sales-order-display';

describe('document status pills (internal-API normalized statuses)', () => {
  it('maps every sales-order internalStatus to its canonical Spanish pill', () => {
    expect(getSalesOrderStatusPill('requested')).toEqual({ label: 'A revisar', className: 'pending' });
    expect(getSalesOrderStatusPill('in_process')).toEqual({ label: 'Pendiente preparar', className: 'pending' });
    expect(getSalesOrderStatusPill('partially_prepared')).toEqual({ label: 'Parcialmente preparado', className: 'partial' });
    expect(getSalesOrderStatusPill('prepared')).toEqual({ label: 'Preparado', className: 'served' });
    expect(getSalesOrderStatusPill('partially_delivered')).toEqual({ label: 'Parcialmente entregado', className: 'partial' });
    expect(getSalesOrderStatusPill('all_delivered')).toEqual({ label: 'Totalmente entregado', className: 'served' });
    expect(getSalesOrderStatusPill('cancelled')).toEqual({ label: 'Cancelado', className: 'cancelled' });
  });

  it('shows the waybill approval label, never Preparado/Entregado', () => {
    expect(getWaybillStatusPill('prepared')).toEqual({ label: 'Sin aprobar', className: 'pending' });
    expect(getWaybillStatusPill('delivered')).toEqual({ label: 'Aprobado', className: 'served' });
    expect(getWaybillStatusPill('cancelled')).toEqual({ label: 'Cancelado', className: 'cancelled' });
  });

  it('maps estimate displayStatus values', () => {
    expect(getEstimateStatusPill('draft')).toEqual({ label: 'Borrador', className: 'pending' });
    expect(getEstimateStatusPill('pending')).toEqual({ label: 'Pendiente', className: 'pending' });
    expect(getEstimateStatusPill('sent')).toEqual({ label: 'Enviado', className: 'pending' });
    expect(getEstimateStatusPill('accepted')).toEqual({ label: 'Aceptado', className: 'served' });
    expect(getEstimateStatusPill('rejected')).toEqual({ label: 'Denegado', className: 'cancelled' });
  });

  it('maps purchase-order reception statuses', () => {
    expect(getPurchaseOrderStatusPill('review')).toEqual({ label: 'A revisar', className: 'pending' });
    expect(getPurchaseOrderStatusPill('awaiting_receipt')).toEqual({ label: 'Pendiente recibir', className: 'pending' });
    expect(getPurchaseOrderStatusPill('partially_received_unconfirmed')).toEqual({ label: 'Recepción parcial sin confirmar', className: 'partial' });
    expect(getPurchaseOrderStatusPill('received_unconfirmed')).toEqual({ label: 'Recepción completa sin confirmar', className: 'partial' });
    expect(getPurchaseOrderStatusPill('partially_received')).toEqual({ label: 'Parcialmente recibido', className: 'partial' });
    expect(getPurchaseOrderStatusPill('all_received')).toEqual({ label: 'Totalmente recibido', className: 'served' });
    expect(getPurchaseOrderStatusPill('cancelled')).toEqual({ label: 'Cancelado', className: 'cancelled' });
  });

  it('falls back to the raw value in a neutral pill for unknown statuses', () => {
    expect(getSalesOrderStatusPill('mystery')).toEqual({ label: 'mystery', className: 'pending' });
    expect(getSalesOrderStatusPill(null)).toEqual({ label: 'Sin estado', className: 'pending' });
  });

  it('reads the server-derived enum appropriate to each document type', () => {
    expect(getDocumentStatusPill({ type: 'sales-orders', internalStatus: 'prepared' }))
      .toEqual({ label: 'Preparado', className: 'served' });
    expect(getDocumentStatusPill({ type: 'waybills', workflowStatus: 'delivered' }))
      .toEqual({ label: 'Aprobado', className: 'served' });
    expect(getDocumentStatusPill({ type: 'estimates', displayStatus: 'rejected' }))
      .toEqual({ label: 'Denegado', className: 'cancelled' });
    expect(getDocumentStatusPill({ type: 'purchase-orders', internalStatus: 'all_received' }))
      .toEqual({ label: 'Totalmente recibido', className: 'served' });
  });
});
