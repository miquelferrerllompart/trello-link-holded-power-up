const ELECTRICAFERRER_APP_BASE = 'https://app.electricaferrer.es';

const DOCUMENT_PATHS: Readonly<Record<string, string>> = {
  'sales-orders': 'pedido',
  waybills: 'albaran',
  'purchase-orders': 'pedido-compra',
  estimates: 'presupuesto/editar',
};

const ENTITY_PATHS: Readonly<Record<string, string>> = {
  contact: 'contacto',
  project: 'proyecto',
};

export function buildElectricaferrerDocumentUrl(type: string, id: unknown): string | null {
  const path = DOCUMENT_PATHS[type];
  const normalizedId = String(id ?? '').trim();

  if (!path || !normalizedId) return null;
  return `${ELECTRICAFERRER_APP_BASE}/${path}/${encodeURIComponent(normalizedId)}`;
}

export function buildElectricaferrerEntityUrl(type: string, id: unknown): string | null {
  const path = ENTITY_PATHS[type];
  const normalizedId = String(id ?? '').trim();

  if (!path || !normalizedId) return null;
  return `${ELECTRICAFERRER_APP_BASE}/${path}/${encodeURIComponent(normalizedId)}`;
}
