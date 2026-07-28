// @ts-nocheck
import { JSDOM } from 'jsdom';
import { afterEach, describe, expect, it, vi } from 'vitest';

function installPopupDom(markup: string) {
  const dom = new JSDOM(markup, { url: 'https://power-up.test/' });
  const trello = {
    popup: vi.fn(),
    closePopup: vi.fn(),
    get: vi.fn(),
    set: vi.fn(),
    remove: vi.fn(),
    card: vi.fn(),
    getRestApi: () => ({
      isAuthorized: async () => true,
      authorize: async () => undefined,
      getToken: async () => 'trello-token',
    }),
  };

  Object.assign(dom.window, {
    TrelloPowerUp: { iframe: () => trello },
  });
  vi.stubGlobal('window', dom.window);
  vi.stubGlobal('document', dom.window.document);

  return { dom, trello };
}

describe('popup search behavior', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('does not link a contact when its full detail cannot be loaded', async () => {
    const { dom, trello } = installPopupDom(`
      <input id="search" />
      <div id="results"></div>
    `);
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        total: 1,
        results: [{ id: 'contact-1', name: 'Cliente Uno' }],
      })))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        error: { code: 'DATA_NOT_READY', message: 'Not ready' },
      }), { status: 503 }));
    vi.stubGlobal('fetch', fetchImpl);
    vi.spyOn(console, 'error').mockImplementation(() => {});

    await import('./popups/search-contact');

    const input = dom.window.document.getElementById('search') as HTMLInputElement;
    input.value = 'Cliente';
    input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));

    await vi.waitFor(() => {
      expect(dom.window.document.querySelector('.result-item')).not.toBeNull();
    });
    (dom.window.document.querySelector('.result-item') as HTMLElement).click();

    await vi.waitFor(() => {
      expect(dom.window.document.querySelector('.selection-error')?.textContent)
        .toContain('Pulsa de nuevo para reintentar');
    });
    expect(trello.set).not.toHaveBeenCalled();
    expect(trello.closePopup).not.toHaveBeenCalled();
    expect(fetchImpl).toHaveBeenCalledTimes(2);

    dom.window.close();
  });

  it('forwards the create-contact click event when opening its popup', async () => {
    const { dom, trello } = installPopupDom(`
      <input id="search" />
      <div id="results"></div>
    `);

    await import('./popups/search-contact');

    const createButton = dom.window.document.getElementById('create-contact-btn')!;
    const clickEvent = new dom.window.MouseEvent('click', { bubbles: true });
    createButton.dispatchEvent(clickEvent);

    expect(trello.popup).toHaveBeenCalledWith({
      title: 'Crear contacto',
      url: './create-contact.html',
      height: 420,
      mouseEvent: clickEvent,
    });

    dom.window.close();
  });

  it('forwards the contact click event when opening the address-selection popup', async () => {
    const { dom, trello } = installPopupDom(`
      <input id="search" />
      <div id="results"></div>
    `);
    trello.card.mockResolvedValue({ id: 'card-1' });
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        total: 1,
        results: [{ id: 'contact-1', name: 'Cliente Uno' }],
      })))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        id: 'contact-1',
        name: 'Cliente Uno',
        billAddress: {
          address: 'C/ Major 1',
          city: 'Palma',
          postalCode: '07001',
          province: 'Illes Balears',
          country: 'España',
        },
        shippingAddresses: [{
          name: 'Obra Norte',
          address: 'C/ Nord 2',
          city: 'Palma',
          postalCode: '07002',
          province: 'Illes Balears',
          country: 'España',
        }],
      }))));

    await import('./popups/search-contact');

    const input = dom.window.document.getElementById('search') as HTMLInputElement;
    input.value = 'Cliente';
    input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));

    await vi.waitFor(() => {
      expect(dom.window.document.querySelector('.result-item')).not.toBeNull();
    });
    const clickEvent = new dom.window.MouseEvent('click', { bubbles: true });
    dom.window.document.querySelector('.result-item')!.dispatchEvent(clickEvent);

    await vi.waitFor(() => {
      expect(trello.popup).toHaveBeenCalledWith({
        title: 'Seleccionar dirección',
        url: './select-address.html',
        height: 300,
        mouseEvent: clickEvent,
      });
    });

    dom.window.close();
  });

  it('opens address selection when the contact only has its billing address', async () => {
    const { dom, trello } = installPopupDom(`
      <input id="search" />
      <div id="results"></div>
    `);
    trello.card.mockResolvedValue({ id: 'card-1' });
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        total: 1,
        results: [{ id: 'contact-1', name: 'Cliente Uno' }],
      })))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        id: 'contact-1',
        name: 'Cliente Uno',
        billAddress: {
          address: 'C/ Major 1',
          city: 'Palma',
          postalCode: '07001',
          province: 'Illes Balears',
          country: 'España',
        },
        shippingAddresses: [],
      }))));

    await import('./popups/search-contact');

    const input = dom.window.document.getElementById('search') as HTMLInputElement;
    input.value = 'Cliente';
    input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));

    await vi.waitFor(() => {
      expect(dom.window.document.querySelector('.result-item')).not.toBeNull();
    });
    const clickEvent = new dom.window.MouseEvent('click', { bubbles: true });
    dom.window.document.querySelector('.result-item')!.dispatchEvent(clickEvent);

    await vi.waitFor(() => {
      expect(trello.popup).toHaveBeenCalledWith({
        title: 'Seleccionar dirección',
        url: './select-address.html',
        height: 300,
        mouseEvent: clickEvent,
      });
    });
    expect(trello.closePopup).not.toHaveBeenCalled();
    expect(JSON.parse(dom.window.localStorage.getItem('holdedPendingContact:card-1'))).toEqual({
      contactId: 'contact-1',
      contactName: 'Cliente Uno',
      billAddress: {
        address: 'C/ Major 1',
        city: 'Palma',
        postalCode: '07001',
        province: 'Illes Balears',
        country: 'España',
      },
      shippingAddresses: [],
    });

    dom.window.close();
  });

  it('opens address selection after creating a contact', async () => {
    const { dom, trello } = installPopupDom(`
      <div id="form">
        <input id="name" />
        <input id="code" />
        <input id="address" />
        <input id="city" />
        <input id="postalCode" />
        <input id="province" />
        <input id="country" />
        <input id="email" />
        <input id="phone" />
        <div id="type-toggle">
          <button type="button" data-value="empresa">Empresa</button>
          <button type="button" data-value="persona">Persona</button>
        </div>
        <button type="button" id="submit-btn">Crear contacto</button>
        <div id="code-duplicate-msg"></div>
        <div id="error-msg"></div>
      </div>
    `);
    trello.card.mockResolvedValue({ id: 'card-1', desc: '' });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      id: 'contact-1',
    }))));

    await import('./popups/create-contact');

    const values = {
      name: 'Cliente Uno',
      code: 'B12345678',
      address: 'C/ Major 1',
      city: 'Palma',
      postalCode: '07001',
      province: 'Illes Balears',
      country: 'España',
      email: 'cliente@example.com',
    };
    for (const [id, value] of Object.entries(values)) {
      (dom.window.document.getElementById(id) as HTMLInputElement).value = value;
    }
    dom.window.document.querySelector<HTMLButtonElement>('[data-value="empresa"]')!.click();

    const submit = dom.window.document.getElementById('submit-btn') as HTMLButtonElement;
    expect(submit.disabled).toBe(false);
    const clickEvent = new dom.window.MouseEvent('click', { bubbles: true });
    submit.dispatchEvent(clickEvent);

    await vi.waitFor(() => {
      expect(trello.popup).toHaveBeenCalledWith({
        title: 'Seleccionar dirección',
        url: './select-address.html',
        height: 300,
        mouseEvent: clickEvent,
      });
    });
    expect(trello.closePopup).not.toHaveBeenCalled();
    expect(JSON.parse(dom.window.localStorage.getItem('holdedPendingContact:card-1'))).toEqual({
      contactId: 'contact-1',
      contactName: 'Cliente Uno',
      billAddress: {
        address: 'C/ Major 1',
        city: 'Palma',
        postalCode: '07001',
        province: 'Illes Balears',
      },
      shippingAddresses: [],
    });

    dom.window.close();
  });

  it('shows both the linked client and project code in project results', async () => {
    const { dom } = installPopupDom(`
      <input id="search" />
      <div id="results"></div>
    `);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      total: 1,
      results: [{
        id: 'project-1',
        name: 'Obra Norte',
        contactName: 'Cliente Uno',
        key: 'AUT3',
      }],
    }))));

    await import('./popups/search-project');

    const input = dom.window.document.getElementById('search') as HTMLInputElement;
    input.value = 'Obra';
    input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));

    await vi.waitFor(() => {
      expect(dom.window.document.querySelector('.result-status')?.textContent)
        .toBe('Cliente Uno · AUT3');
    });

    dom.window.close();
  });

  it('adds the mobile creation links after linking a project to a customer', async () => {
    const { dom, trello } = installPopupDom(`
      <input id="search" />
      <div id="results"></div>
    `);
    trello.get.mockResolvedValue({
      contactId: 'customer-1',
      contactName: 'Cliente Uno',
    });
    trello.card.mockResolvedValue({ id: 'card-1', desc: 'Nota de montaje.' });
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        total: 1,
        results: [{ id: 'project-1', name: 'Obra Norte' }],
      })))
      .mockResolvedValueOnce(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchImpl);

    await import('./popups/search-project');

    const input = dom.window.document.getElementById('search') as HTMLInputElement;
    input.value = 'Obra';
    input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    await vi.waitFor(() => {
      expect(dom.window.document.querySelector('.result-item')).not.toBeNull();
    });
    (dom.window.document.querySelector('.result-item') as HTMLElement).click();

    await vi.waitFor(() => expect(trello.closePopup).toHaveBeenCalled());
    const description = JSON.parse(fetchImpl.mock.calls[1][1].body).desc;
    expect(description).toContain(
      '/albaran-trabajo/nuevo?projectId=project-1&customerId=customer-1'
    );
    expect(description).toContain(
      '/albaran-trabajo-extra/nuevo?projectId=project-1&customerId=customer-1'
    );
    expect(description).toContain(
      '/pedido/nuevo?projectId=project-1&customerId=customer-1'
    );
    expect(description.endsWith('{{ project: Obra Norte }}')).toBe(true);

    dom.window.close();
  });
});

describe('address selection behavior', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('offers address creation without rendering an empty billing address', async () => {
    const { dom, trello } = installPopupDom('<div id="addresses"></div>');
    trello.get.mockResolvedValue({
      contactId: 'contact-1',
      contactName: 'Cliente Uno',
      billAddress: {
        address: '',
        city: '',
        postalCode: '',
        province: '',
      },
      shippingAddresses: [],
    });

    await import('./popups/select-address');

    await vi.waitFor(() => {
      expect(dom.window.document.getElementById('create-addr-btn')).not.toBeNull();
    });
    expect(dom.window.document.querySelector('.address-item')).toBeNull();
    expect(dom.window.document.getElementById('create-addr-btn')?.textContent)
      .toContain('Nueva dirección de envío');

    dom.window.close();
  });

  it('labels a shipping address by street and city when its reference is empty', async () => {
    const { dom, trello } = installPopupDom('<div id="addresses"></div>');
    trello.get.mockResolvedValue({
      contactId: 'contact-1',
      contactName: 'Cliente Uno',
      billAddress: {
        address: '',
        city: '',
        postalCode: '',
        province: '',
      },
      shippingAddresses: [{
        name: '',
        address: 'C/ Nord 2',
        city: 'Palma',
        postalCode: '07002',
        province: 'Illes Balears',
        country: 'España',
      }],
    });

    await import('./popups/select-address');

    await vi.waitFor(() => {
      expect(dom.window.document.querySelector('.address-item')).not.toBeNull();
    });
    expect(dom.window.document.querySelector('.address-name')?.textContent)
      .toBe('C/ Nord 2, Palma');

    dom.window.close();
  });

  it('renders CRM address fields as text instead of HTML', async () => {
    const { dom, trello } = installPopupDom('<div id="addresses"></div>');
    const unsafeName = '<img src=x onerror="alert(1)">Obra</img>';
    const unsafeAddress = '<strong>Calle Norte 2</strong>';
    trello.get.mockResolvedValue({
      contactId: 'contact-1',
      contactName: 'Cliente Uno',
      billAddress: {
        address: '',
        city: '',
        postalCode: '',
        province: '',
      },
      shippingAddresses: [{
        name: unsafeName,
        address: unsafeAddress,
        city: 'Palma',
        postalCode: '07002',
        province: 'Illes Balears',
        country: 'España',
      }],
    });

    await import('./popups/select-address');

    await vi.waitFor(() => {
      expect(dom.window.document.querySelector('.address-item')).not.toBeNull();
    });
    expect(dom.window.document.querySelector('.address-name img')).toBeNull();
    expect(dom.window.document.querySelector('.address-name')?.textContent).toBe(unsafeName);
    expect(dom.window.document.querySelector('.address-detail strong')).toBeNull();
    expect(dom.window.document.querySelector('.address-detail')?.textContent)
      .toContain(unsafeAddress);

    dom.window.close();
  });

  it('adds the mobile creation links after linking a customer to a project', async () => {
    const { dom, trello } = installPopupDom('<div id="addresses"></div>');
    const pending = {
      contactId: 'customer-1',
      contactName: 'Cliente Uno',
      billAddress: {
        address: 'C/ Major 1',
        city: 'Palma',
        postalCode: '07001',
        province: 'Illes Balears',
        country: 'España',
      },
      shippingAddresses: [],
    };
    trello.get
      .mockResolvedValueOnce(pending)
      .mockResolvedValueOnce({
        projectId: 'project-1',
        projectName: 'Obra Norte',
      })
      .mockResolvedValueOnce(pending);
    trello.card.mockResolvedValue({ id: 'card-1', desc: 'Nota de montaje.' });
    const fetchImpl = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchImpl);

    await import('./popups/select-address');

    await vi.waitFor(() => {
      expect(dom.window.document.querySelector('.address-item')).not.toBeNull();
    });
    (dom.window.document.querySelector('.address-item') as HTMLElement).click();

    await vi.waitFor(() => expect(trello.closePopup).toHaveBeenCalled());
    const description = JSON.parse(fetchImpl.mock.calls[0][1].body).desc;
    expect(description).toContain(
      '/albaran-trabajo/nuevo?projectId=project-1&customerId=customer-1'
    );
    expect(description).toContain(
      '**Dirección:** [C/ Major 1, 07001 Palma, Illes Balears, España ↗](https://www.google.com/maps/search/?api=1&query=C%2F%20Major%201%2C%2007001%20Palma%2C%20Illes%20Balears%2C%20Espa%C3%B1a)'
    );
    expect(description).toContain('{{ contact: Cliente Uno | C/ Major 1, Palma }}');
    expect(description.endsWith('{{ project: Obra Norte }}')).toBe(true);
    const saved = trello.set.mock.calls.find((call) => call[2] === 'holdedData')?.[3];
    expect(saved.addressMapQuery).toBe('C/ Major 1, 07001 Palma, Illes Balears, España');

    dom.window.close();
  });

  it('uses the full shipping address for Maps instead of its short reference', async () => {
    const { dom, trello } = installPopupDom('<div id="addresses"></div>');
    const pending = {
      contactId: 'customer-1',
      contactName: 'Cliente Uno',
      billAddress: { address: '', city: '', postalCode: '', province: '' },
      shippingAddresses: [{
        name: 'Obra Norte',
        address: 'Rua Norte 2',
        city: 'Porto',
        postalCode: '4000-001',
        province: 'Porto',
        country: 'Portugal',
      }],
    };
    trello.get
      .mockResolvedValueOnce(pending)
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce(pending);
    trello.card.mockResolvedValue({ id: 'card-1', desc: '' });
    const fetchImpl = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchImpl);

    await import('./popups/select-address');

    await vi.waitFor(() => {
      expect(dom.window.document.querySelector('.address-item')).not.toBeNull();
    });
    (dom.window.document.querySelector('.address-item') as HTMLElement).click();

    await vi.waitFor(() => expect(trello.closePopup).toHaveBeenCalled());
    const description = JSON.parse(fetchImpl.mock.calls[0][1].body).desc;
    expect(description).toContain(
      'query=Rua%20Norte%202%2C%204000-001%20Porto%2C%20Porto%2C%20Portugal'
    );
    expect(description).toContain('{{ contact: Cliente Uno | Obra Norte }}');
    const saved = trello.set.mock.calls.find((call) => call[2] === 'holdedData')?.[3];
    expect(saved.addressMapQuery).toBe('Rua Norte 2, 4000-001 Porto, Porto, Portugal');

    dom.window.close();
  });

  it('adds the newly created shipping address as a Google Maps link', async () => {
    const { dom, trello } = installPopupDom('<div id="addresses"></div>');
    const pending = {
      contactId: 'customer-1',
      contactName: 'Cliente Uno',
      billAddress: { address: '', city: '', postalCode: '', province: '' },
      shippingAddresses: [],
    };
    trello.get
      .mockResolvedValueOnce(pending)
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce(pending);
    trello.card.mockResolvedValue({ id: 'card-1', desc: '' });
    const fetchImpl = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchImpl);

    await import('./popups/select-address');

    await vi.waitFor(() => {
      expect(dom.window.document.getElementById('create-addr-btn')).not.toBeNull();
    });
    dom.window.document.getElementById('create-addr-btn')!.click();

    const values = {
      'addr-name': 'Obra Nueva',
      'addr-address': 'C/ Nou 3',
      'addr-city': 'Palma',
      'addr-postalCode': '07003',
      'addr-province': 'Illes Balears',
    };
    for (const [id, value] of Object.entries(values)) {
      (dom.window.document.getElementById(id) as HTMLInputElement).value = value;
    }
    dom.window.document.getElementById('create-form')!
      .dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    (dom.window.document.getElementById('btn-create') as HTMLButtonElement).click();

    await vi.waitFor(() => expect(trello.closePopup).toHaveBeenCalled());
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const description = JSON.parse(fetchImpl.mock.calls[1][1].body).desc;
    expect(description).toContain(
      'query=C%2F%20Nou%203%2C%2007003%20Palma%2C%20Illes%20Balears%2C%20Espa%C3%B1a'
    );
    expect(description).toContain('{{ contact: Cliente Uno | Obra Nueva }}');
    const saved = trello.set.mock.calls.find((call) => call[2] === 'holdedData')?.[3];
    expect(saved.addressMapQuery).toBe('C/ Nou 3, 07003 Palma, Illes Balears, España');

    dom.window.close();
  });
});
