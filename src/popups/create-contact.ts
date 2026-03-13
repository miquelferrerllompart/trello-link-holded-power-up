import { createContact } from '../holded-api';
import { getCardData, setCardData } from '../storage';
import { addTag } from '../description-tags';
import { updateCardDescription } from '../trello-api';
import type { TrelloContext } from '../types';

const t = window.TrelloPowerUp.iframe({ appKey: '81d86f6c21c827e54947d36746561233', appName: 'Holded' }) as unknown as TrelloContext;

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
  return fieldsOk && hasContact && contactValid && isperson !== null;
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

    const payload = {
      name: nameInput.value.trim(),
      code: codeInput.value.trim(),
      isperson,
      email: emailInput.value.trim() || undefined,
      phone: phoneInput.value.trim() || undefined,
      billAddress: {
        address: addressInput.value.trim(),
        city: cityInput.value.trim(),
        postalCode: postalCodeInput.value.trim(),
        province: provinceInput.value.trim(),
        country: countryInput.value.trim(),
      },
      note: `Creado desde Trello por ${member.fullName} — Tablero: ${board.name}`,
    };
    const result = await createContact(payload);

    // Auto-assign contact to card
    const contactId = result.id;
    const contactName = nameInput.value.trim();

    const addressLabel = [addressInput.value.trim(), cityInput.value.trim()]
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
