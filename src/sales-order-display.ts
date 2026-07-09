const STATUS_LABELS: Record<string, string> = {
  pending: 'Pendiente',
  completed: 'Completado',
  partial: 'Parcial',
  cancelled: 'Cancelado',
  failed: 'Fallido',
  overdue: 'Vencido',
};

export interface StatusPill {
  label: string;
  className: string;
}

export interface ShippedItemsTracking {
  count: number;
  fields: string[];
  items: unknown[];
  error?: string;
}

export interface DocumentStatusInput {
  type: 'sales-orders' | 'purchase-orders' | 'waybills' | string;
  status?: string | null;
  shippedItems?: ShippedItemsTracking;
}

export function getSalesOrderStatusLabel(status: string | null | undefined): string {
  if (!status) return 'Sin estado';
  return STATUS_LABELS[status] || status;
}

export function getStatusClass(status: string | null | undefined): string {
  if (status === 'completed') return 'served';
  if (status === 'partial') return 'partial';
  if (status === 'cancelled' || status === 'failed') return status;
  return 'pending';
}

function getNumberValue(value: unknown): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

export function getSalesOrderShipmentPill(tracking: ShippedItemsTracking | undefined): StatusPill {
  if (!tracking || tracking.error) return { label: 'Sin datos envío', className: 'review' };

  const items = Array.isArray(tracking.items) ? tracking.items : [];
  let sent = 0;
  let pending = 0;
  let total = 0;

  for (const item of items) {
    const record = item && typeof item === 'object' ? item as Record<string, unknown> : {};
    sent += getNumberValue(record.sent);
    pending += getNumberValue(record.pending);
    total += getNumberValue(record.total);
  }

  if (pending <= 0 && sent !== 0) return { label: 'Preparado', className: 'served' };
  if (sent === 0 && pending > 0) return { label: 'Pendiente', className: 'pending' };
  if (sent > 0 && pending > 0) return { label: 'Parcial', className: 'partial' };
  return { label: 'Pendiente', className: 'pending' };
}

export function getWaybillStatusPill(status: string | null | undefined): StatusPill {
  if (status === 'completed') return { label: 'Aceptado', className: 'served' };
  if (status === 'pending') return { label: 'Pendiente', className: 'pending' };
  if (status === 'cancelled' || status === 'failed') {
    return { label: getSalesOrderStatusLabel(status), className: status };
  }
  return { label: getSalesOrderStatusLabel(status), className: getStatusClass(status) };
}

export function getDocumentStatusPills(document: DocumentStatusInput): StatusPill[] {
  if (document.type === 'sales-orders') return [getSalesOrderShipmentPill(document.shippedItems)];
  if (document.type === 'waybills') return [getWaybillStatusPill(document.status)];
  return [{
    label: getSalesOrderStatusLabel(document.status),
    className: getStatusClass(document.status),
  }];
}
