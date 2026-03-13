import { getCardData, setCardData } from '../storage';
import { addTag } from '../description-tags';
import { updateCardDescription } from '../trello-api';
import { addShippingAddress } from '../holded-api';
import type { PendingContactSelection, TrelloContext } from '../types';

const t = window.TrelloPowerUp.iframe({ appKey: '81d86f6c21c827e54947d36746561233', appName: 'Holded' }) as unknown as TrelloContext;
const addressesDiv = document.getElementById('addresses') as HTMLDivElement;

interface AddressOption {
  label: string;
  detail: string;
}

function formatAddress(address: string | null, city: string | null, postalCode: string, province: string | null): string {
  return [address, [postalCode, city].filter(Boolean).join(' '), province].filter(Boolean).join(', ');
}

function buildAddressLabel(address: string | null, city: string | null): string {
  return [address, city].filter(Boolean).join(', ') || 'Sin dirección';
}

async function selectAddress(pending: PendingContactSelection, addressLabel: string) {
  const data = await getCardData(t);
  data.contactId = pending.contactId;
  data.contactName = pending.contactName;
  data.addressLabel = addressLabel;
  await setCardData(t, data);

  try {
    const card = await t.card('id', 'desc');
    const newDesc = addTag(card.desc || '', 'contact', pending.contactName, addressLabel);
    await updateCardDescription(t, newDesc);
  } catch (err) { console.error('Holded: error syncing description', err); }

  await t.remove('card', 'shared', 'holdedPendingContact');
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
        name: nameInput.value.trim(),
        address: addressInput.value.trim(),
        city: cityInput.value.trim(),
        postalCode: postalCodeInput.value.trim(),
        province: provinceInput.value.trim(),
        country: countryInput.value.trim(),
      };

      await addShippingAddress(pending.contactId, pending.shippingAddresses, newAddr);
      await selectAddress(pending, newAddr.name);
    } catch (err) {
      errorMsg.textContent = (err as Error).message;
      errorMsg.style.display = 'block';
      createBtn.disabled = false;
      createBtn.textContent = 'Crear y seleccionar';
    }
  });
}

async function render() {
  const pending = await t.get('card', 'shared', 'holdedPendingContact') as PendingContactSelection | null;
  if (!pending) {
    addressesDiv.innerHTML = '<div class="loading">No hay datos de contacto.</div>';
    return;
  }

  const options: AddressOption[] = [];

  // Bill address
  const bill = pending.billAddress;
  options.push({
    label: 'Dirección fiscal',
    detail: formatAddress(bill.address, bill.city, bill.postalCode, bill.province),
  });

  // Shipping addresses
  for (const ship of pending.shippingAddresses) {
    options.push({
      label: ship.name,
      detail: formatAddress(ship.address, ship.city, ship.postalCode, ship.province),
    });
  }

  addressesDiv.innerHTML = options
    .map((opt, i) => `
      <div class="address-item" data-index="${i}">
        <div class="address-icon">📍</div>
        <div class="address-info">
          <div class="address-name">${opt.label}</div>
          <div class="address-detail">${opt.detail}</div>
        </div>
      </div>`)
    .join('') +
    '<button class="create-btn" id="create-addr-btn">+ Nueva dirección de envío</button>';

  addressesDiv.querySelectorAll('.address-item').forEach((el) => {
    el.addEventListener('click', async () => {
      const index = parseInt((el as HTMLElement).dataset.index!, 10);
      let addressLabel: string;

      if (index === 0) {
        addressLabel = buildAddressLabel(bill.address, bill.city);
      } else {
        addressLabel = pending.shippingAddresses[index - 1].name;
      }

      await selectAddress(pending, addressLabel);
    });
  });

  document.getElementById('create-addr-btn')!.addEventListener('click', () => {
    showCreateForm(pending);
  });
}

render();
