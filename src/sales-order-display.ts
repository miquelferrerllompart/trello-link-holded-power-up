export interface StatusPill {
  label: string;
  className: string;
}

// Pill colour vocabulary (maps to CSS classes on `.document-pill`):
//   done = green, partial = yellow, pending = neutral, cancelled = red.
// Labels are the canonical Spanish strings from the internal-API contract.

const SALES_ORDER_STATUS: Record<string, StatusPill> = {
  requested: { label: 'A revisar', className: 'pending' },
  in_process: { label: 'Pendiente preparar', className: 'pending' },
  partially_prepared: { label: 'Parcialmente preparado', className: 'partial' },
  prepared: { label: 'Preparado', className: 'done' },
  partially_delivered: { label: 'Parcialmente entregado', className: 'partial' },
  all_delivered: { label: 'Totalmente entregado', className: 'done' },
  cancelled: { label: 'Cancelado', className: 'cancelled' },
};

// The waybill workflow status is a delivery projection derived from approvedAt.
const WAYBILL_STATUS: Record<string, StatusPill> = {
  prepared: { label: 'Por entregar', className: 'pending' },
  delivered: { label: 'Entregado', className: 'done' },
  cancelled: { label: 'Cancelado', className: 'cancelled' },
};

const ESTIMATE_STATUS: Record<string, StatusPill> = {
  draft: { label: 'Borrador', className: 'pending' },
  pending: { label: 'Pendiente', className: 'pending' },
  sent: { label: 'Enviado', className: 'pending' },
  accepted: { label: 'Aceptado', className: 'done' },
  rejected: { label: 'Denegado', className: 'cancelled' },
};

const INVOICE_STATUS: Record<string, StatusPill> = {
  draft: { label: 'Borrador', className: 'pending' },
  pending: { label: 'Pendiente', className: 'pending' },
  partial: { label: 'Parcial', className: 'partial' },
  overdue: { label: 'Vencida', className: 'failed' },
  paid: { label: 'Cobrada', className: 'done' },
  cancelled: { label: 'Cancelada', className: 'cancelled' },
  failed: { label: 'Fallida', className: 'failed' },
};

const PURCHASE_ORDER_STATUS: Record<string, StatusPill> = {
  review: { label: 'A revisar', className: 'pending' },
  awaiting_receipt: { label: 'Pendiente recibir', className: 'pending' },
  partially_received_unconfirmed: { label: 'Recepción parcial sin confirmar', className: 'partial' },
  received_unconfirmed: { label: 'Recepción completa sin confirmar', className: 'partial' },
  partially_received: { label: 'Parcialmente recibido', className: 'partial' },
  all_received: { label: 'Totalmente recibido', className: 'done' },
  cancelled: { label: 'Cancelado', className: 'cancelled' },
};

// Unknown enums fall back to the raw value in a neutral pill rather than hiding it.
function fromStatusMap(map: Record<string, StatusPill>, value: string | null | undefined): StatusPill {
  if (value && map[value]) return map[value];
  if (value) return { label: value, className: 'pending' };
  return { label: 'Sin estado', className: 'pending' };
}

export function getSalesOrderStatusPill(status: string | null | undefined): StatusPill {
  return fromStatusMap(SALES_ORDER_STATUS, status);
}

export function getWaybillStatusPill(workflowStatus: string | null | undefined): StatusPill {
  return fromStatusMap(WAYBILL_STATUS, workflowStatus);
}

export function getEstimateStatusPill(displayStatus: string | null | undefined): StatusPill {
  return fromStatusMap(ESTIMATE_STATUS, displayStatus);
}

export function getInvoiceStatusPill(displayStatus: string | null | undefined): StatusPill {
  return fromStatusMap(INVOICE_STATUS, displayStatus);
}

export function getPurchaseOrderStatusPill(status: string | null | undefined): StatusPill {
  return fromStatusMap(PURCHASE_ORDER_STATUS, status);
}

export interface DocumentStatusInput {
  type: 'sales-orders' | 'purchase-orders' | 'waybills' | 'estimates' | string;
  // Every field below is a server-derived enum from the internal API, not the
  // document's approval `status`.
  internalStatus?: string | null;
  workflowStatus?: string | null;
  displayStatus?: string | null;
}

export function getDocumentStatusPill(document: DocumentStatusInput): StatusPill {
  if (document.type === 'waybills') return getWaybillStatusPill(document.workflowStatus);
  if (document.type === 'estimates') return getEstimateStatusPill(document.displayStatus);
  if (document.type === 'invoices') return getInvoiceStatusPill(document.displayStatus);
  if (document.type === 'purchase-orders') return getPurchaseOrderStatusPill(document.internalStatus);
  return getSalesOrderStatusPill(document.internalStatus);
}
