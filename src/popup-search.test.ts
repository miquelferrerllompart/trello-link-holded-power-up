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
    card: vi.fn(),
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
});
