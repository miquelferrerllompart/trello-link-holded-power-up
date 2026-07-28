import { getCardData, setCardData } from '../storage';
import { syncDescriptionSection } from '../description-tags';
import { updateCardDescription } from '../trello-api';
import { addShippingAddress } from '../holded-api';
import { createSubmissionKeyer } from '../idempotency';
import { TRELLO_APP_KEY } from '../config';
import { formatSpanishTextCase } from '../spanish-text-case';
import { getPendingContactSelection, removePendingContactSelection } from '../pending-contact';
import type { PendingContactSelection, TrelloContext } from '../types';

const t = window.TrelloPowerUp.iframe({ appKey: TRELLO_APP_KEY, appName: 'Holded' }) as unknown as TrelloContext;
const addressesDiv = document.getElementById('addresses') as HTMLDivElement;

const submissionKeyer = createSubmissionKeyer();

interface AddressOption {
  label: string;
  detail: string;
  addressLabel: string;
  mapQuery: string;
}

function formatAddress(
  address: string | null,
  city: string | null,
  postalCode: string,
  province: string | null,
  country?: string | null,
): string {
  return [address, [postalCode, city].filter(Boolean).join(' '), province, country]
    .filter(Boolean)
    .join(', ');
}

function escapeHtml(value: string): string {
  const entities: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  };
  return value.replace(/[&<>"']/g, (character) => entities[character]);
}

function buildAddressLabel(address: string | null, city: string | null): string | undefined {
  return [
    formatSpanishTextCase(address || ''),
    formatSpanishTextCase(city || ''),
  ].filter(Boolean).join(', ') || undefined;
}

async function selectAddress(
  pending: PendingContactSelection,
  addressLabel: string,
  addressMapQuery: string,
) {
  const contactName = formatSpanishTextCase(pending.contactName);
  const data = await getCardData(t);
  data.contactId = pending.contactId;
  data.contactName = contactName;
  data.addressLabel = addressLabel;
  data.addressMapQuery = addressMapQuery || undefined;
  await setCardData(t, data);

  try {
    const card = await t.card('id', 'desc');
    const newDesc = syncDescriptionSection(card.desc || '', data);
    await updateCardDescription(t, newDesc);
  } catch (err) { console.error('Holded: error syncing description', err); }

  await removePendingContactSelection(t);
  t.closePopup();
}

function showCreateForm(pending: PendingContactSelection) {
  addressesDiv.innerHTML = `
    <div class="create-form" id="create-form">
      <div class="form-field">
        <label>Nombre / Referencia *</label>
        <input type="text" id="addr-name" placeholder="Ej: OBRA 1234 CHALET SON VIDA" autofocus />
      </div>
      <div class="form-field">
        <label>Dirección *</label>
        <input type="text" id="addr-address" placeholder="Calle, número..." />
      </div>
      <div class="form-row">
        <div class="form-field">
          <label>Población *</label>
          <input type="text" id="addr-city" placeholder="Población" />
        </div>
        <div class="form-field">
          <label>Código postal *</label>
          <input type="text" id="addr-postalCode" placeholder="07000" />
        </div>
      </div>
      <div class="form-row">
        <div class="form-field">
          <label>Provincia *</label>
          <input type="text" id="addr-province" placeholder="Provincia" />
        </div>
        <div class="form-field">
          <label>País</label>
          <input type="text" id="addr-country" value="España" />
        </div>
      </div>
      <div class="form-actions">
        <button type="button" class="btn-secondary" id="btn-back">Volver</button>
        <button type="button" class="btn-primary" id="btn-create" disabled>Crear y seleccionar</button>
      </div>
      <div class="error-msg" id="error-msg"></div>
    </div>`;

  const nameInput = document.getElementById('addr-name') as HTMLInputElement;
  const addressInput = document.getElementById('addr-address') as HTMLInputElement;
  const cityInput = document.getElementById('addr-city') as HTMLInputElement;
  const postalCodeInput = document.getElementById('addr-postalCode') as HTMLInputElement;
  const provinceInput = document.getElementById('addr-province') as HTMLInputElement;
  const countryInput = document.getElementById('addr-country') as HTMLInputElement;
  const createBtn = document.getElementById('btn-create') as HTMLButtonElement;
  const backBtn = document.getElementById('btn-back') as HTMLButtonElement;
  const errorMsg = document.getElementById('error-msg') as HTMLDivElement;

  function validate() {
    const required = [nameInput, addressInput, cityInput, postalCodeInput, provinceInput];
    createBtn.disabled = !required.every((f) => f.value.trim() !== '');
  }

  document.getElementById('create-form')!.addEventListener('input', validate);

  backBtn.addEventListener('click', () => render());

  createBtn.addEventListener('click', async () => {
    createBtn.disabled = true;
    createBtn.textContent = 'Creando...';
    errorMsg.style.display = 'none';

    try {
      const newAddr = {
        name: formatSpanishTextCase(nameInput.value),
        address: formatSpanishTextCase(addressInput.value),
        city: formatSpanishTextCase(cityInput.value),
        postalCode: postalCodeInput.value.trim(),
        province: formatSpanishTextCase(provinceInput.value),
        country: formatSpanishTextCase(countryInput.value),
      };

      const key = submissionKeyer.keyFor(JSON.stringify({ contactId: pending.contactId, newAddr }));
      await addShippingAddress(pending.contactId, newAddr, key);
      await selectAddress(
        pending,
        newAddr.name,
        formatAddress(
          newAddr.address,
          newAddr.city,
          newAddr.postalCode,
          newAddr.province,
          newAddr.country,
        ),
      );
      submissionKeyer.reset(); // workflow complete
    } catch (err) {
      errorMsg.textContent = (err as Error).message;
      errorMsg.style.display = 'block';
      createBtn.disabled = false;
      createBtn.textContent = 'Crear y seleccionar';
    }
  });
}

async function render() {
  const pending = await getPendingContactSelection(t);
  if (!pending) {
    addressesDiv.innerHTML = '<div class="loading">No hay datos de contacto.</div>';
    return;
  }

  const options: AddressOption[] = [];

  // Bill address
  const bill = pending.billAddress;
  const billAddressLabel = buildAddressLabel(bill.address, bill.city);
  if (billAddressLabel) {
    const mapQuery = formatAddress(
      bill.address,
      bill.city,
      bill.postalCode,
      bill.province,
      bill.country,
    );
    options.push({
      label: 'Dirección fiscal',
      detail: mapQuery,
      addressLabel: billAddressLabel,
      mapQuery,
    });
  }

  // Shipping addresses
  for (const ship of pending.shippingAddresses) {
    const shippingAddressLabel = formatSpanishTextCase(ship.name)
      || buildAddressLabel(ship.address, ship.city);
    if (!shippingAddressLabel) continue;
    const mapQuery = formatAddress(
      ship.address,
      ship.city,
      ship.postalCode,
      ship.province,
      ship.country,
    );

    options.push({
      label: shippingAddressLabel,
      detail: mapQuery,
      addressLabel: shippingAddressLabel,
      mapQuery,
    });
  }

  addressesDiv.innerHTML = options
    .map((opt, i) => `
      <div class="address-item" data-index="${i}">
        <div class="address-icon">📍</div>
        <div class="address-info">
          <div class="address-name">${escapeHtml(opt.label)}</div>
          <div class="address-detail">${escapeHtml(opt.detail)}</div>
        </div>
      </div>`)
    .join('') +
    '<button class="create-btn" id="create-addr-btn">+ Nueva dirección de envío</button>';

  addressesDiv.querySelectorAll('.address-item').forEach((el) => {
    el.addEventListener('click', async () => {
      const index = parseInt((el as HTMLElement).dataset.index!, 10);
      await selectAddress(
        pending,
        options[index].addressLabel,
        options[index].mapQuery,
      );
    });
  });

  document.getElementById('create-addr-btn')!.addEventListener('click', () => {
    showCreateForm(pending);
  });
}

render();
