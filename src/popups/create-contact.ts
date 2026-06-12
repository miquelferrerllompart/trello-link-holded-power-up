import { createContact, searchContacts } from '../holded-api';
import { getCardData, setCardData } from '../storage';
import { addTag } from '../description-tags';
import { updateCardDescription } from '../trello-api';
import { TRELLO_APP_KEY } from '../config';
import { formatSpanishTextCase } from '../spanish-text-case';
import type { TrelloContext } from '../types';

const t = window.TrelloPowerUp.iframe({ appKey: TRELLO_APP_KEY, appName: 'Holded' }) as unknown as TrelloContext;

const nameInput = document.getElementById('name') as HTMLInputElement;
const codeInput = document.getElementById('code') as HTMLInputElement;
const addressInput = document.getElementById('address') as HTMLInputElement;
const cityInput = document.getElementById('city') as HTMLInputElement;
const postalCodeInput = document.getElementById('postalCode') as HTMLInputElement;
const provinceInput = document.getElementById('province') as HTMLInputElement;
const countryInput = document.getElementById('country') as HTMLInputElement;
const emailInput = document.getElementById('email') as HTMLInputElement;
const phoneInput = document.getElementById('phone') as HTMLInputElement;
const submitBtn = document.getElementById('submit-btn') as HTMLButtonElement;
const errorMsg = document.getElementById('error-msg') as HTMLDivElement;
const successMsg = document.getElementById('success-msg') as HTMLDivElement;
const typeToggle = document.getElementById('type-toggle') as HTMLDivElement;

/** null = not selected yet, 1 = persona, 0 = empresa */
let isperson: number | null = null;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[+\d][\d\s\-().]{5,}$/;

const codeDuplicateMsg = document.getElementById('code-duplicate-msg') as HTMLDivElement;
let codeDuplicate = false;
let codeCheckTimer: ReturnType<typeof setTimeout> | null = null;

function clearCodeDuplicate() {
  codeDuplicate = false;
  codeInput.classList.remove('invalid');
  codeDuplicateMsg.style.display = 'none';
}

function checkCodeDuplicate() {
  const code = codeInput.value.trim();
  if (code.length < 3) {
    clearCodeDuplicate();
    return;
  }
  if (codeCheckTimer) clearTimeout(codeCheckTimer);
  codeCheckTimer = setTimeout(async () => {
    // Guard against stale response if user kept typing
    if (codeInput.value.trim() !== code) return;
    try {
      const { results } = await searchContacts(code);
      if (codeInput.value.trim() !== code) return;
      const normalized = code.toUpperCase().replace(/[\s\-]/g, '');
      const match = results.find((c) => {
        const cCode = (c.code || '').toUpperCase().replace(/[\s\-]/g, '');
        const cVat = (c.vatnumber || '').toUpperCase().replace(/[\s\-]/g, '');
        return cCode === normalized || cVat === normalized;
      });
      codeDuplicate = !!match;
      codeInput.classList.toggle('invalid', codeDuplicate);
      if (match) {
        codeDuplicateMsg.textContent = `Ya existe un contacto con este DNI/CIF: ${match.name}`;
        codeDuplicateMsg.style.display = 'block';
      } else {
        codeDuplicateMsg.style.display = 'none';
      }
    } catch {
      clearCodeDuplicate();
    }
    updateSubmitState();
  }, 400);
}

codeInput.addEventListener('input', checkCodeDuplicate);

// Type toggle
typeToggle.querySelectorAll('button').forEach((btn) => {
  btn.addEventListener('click', () => {
    typeToggle.querySelectorAll('button').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    isperson = btn.dataset.value === 'persona' ? 1 : 0;
    updateSubmitState();
  });
});

function isValidEmail(v: string): boolean {
  return v === '' || EMAIL_RE.test(v);
}

function isValidPhone(v: string): boolean {
  return v === '' || PHONE_RE.test(v);
}

function validateForm(): boolean {
  const requiredFields = [nameInput, codeInput, addressInput, cityInput, postalCodeInput, provinceInput];
  const fieldsOk = requiredFields.every((f) => f.value.trim() !== '');
  const email = emailInput.value.trim();
  const phone = phoneInput.value.trim();
  const hasContact = email !== '' || phone !== '';
  const contactValid = isValidEmail(email) && isValidPhone(phone);
  return fieldsOk && hasContact && contactValid && isperson !== null && !codeDuplicate;
}

function updateSubmitState() {
  // Visual validation for email/phone
  const email = emailInput.value.trim();
  const phone = phoneInput.value.trim();
  emailInput.classList.toggle('invalid', email !== '' && !isValidEmail(email));
  phoneInput.classList.toggle('invalid', phone !== '' && !isValidPhone(phone));

  submitBtn.disabled = !validateForm();
  errorMsg.style.display = 'none';
}

// Enable/disable submit on input
document.getElementById('form')!.addEventListener('input', updateSubmitState);

// Initial state
submitBtn.disabled = true;

submitBtn.addEventListener('click', async () => {
  if (!validateForm() || isperson === null) return;

  submitBtn.disabled = true;
  submitBtn.textContent = 'Creando...';
  errorMsg.style.display = 'none';
  successMsg.style.display = 'none';

  try {
    // Fetch Trello context for the note
    const [member, board] = await Promise.all([
      t.member('fullName').catch(() => ({ fullName: 'Desconocido' })),
      t.board('name').catch(() => ({ name: 'Desconocido' })),
    ]);

    const contactName = formatSpanishTextCase(nameInput.value);
    const billAddress = {
      address: formatSpanishTextCase(addressInput.value),
      city: formatSpanishTextCase(cityInput.value),
      postalCode: postalCodeInput.value.trim(),
      province: formatSpanishTextCase(provinceInput.value),
      country: formatSpanishTextCase(countryInput.value),
    };

    const payload = {
      name: contactName,
      code: codeInput.value.trim(),
      isperson,
      type: 'lead',
      email: emailInput.value.trim() || undefined,
      phone: phoneInput.value.trim() || undefined,
      billAddress,
      defaults: {
        salesTax: ['s_iva_21'],
        purchasesTax: ['s_iva_21'],
      },
      note: `Creado desde Trello por ${member.fullName} — Tablero: ${board.name}`,
    };
    const result = await createContact(payload);

    // Auto-assign contact to card
    const contactId = result.id;

    const addressLabel = [billAddress.address, billAddress.city]
      .filter(Boolean).join(', ') || undefined;

    const data = await getCardData(t);
    data.contactId = contactId;
    data.contactName = contactName;
    data.addressLabel = addressLabel;
    await setCardData(t, data);

    try {
      const card = await t.card('id', 'desc');
      const newDesc = addTag(card.desc || '', 'contact', contactName, addressLabel);
      await updateCardDescription(t, newDesc);
    } catch (err) {
      console.error('Holded: error syncing description', err);
    }

    successMsg.textContent = `Contacto "${contactName}" creado y vinculado.`;
    successMsg.style.display = 'block';

    setTimeout(() => t.closePopup(), 1200);
  } catch (err) {
    errorMsg.textContent = (err as Error).message;
    errorMsg.style.display = 'block';
    submitBtn.disabled = false;
    submitBtn.textContent = 'Crear contacto';
  }
});
