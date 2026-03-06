import type { TrelloContext } from '../types';
import { CONTACT_ICON } from '../icons';

export function getBoardButtons(t: unknown) {
  return [
    {
      icon: CONTACT_ICON,
      text: 'Configurar Holded',
      callback: (ctx: TrelloContext) => {
        ctx.popup({
          title: 'Configurar API Key de Holded',
          url: './src/popups/settings.html',
          height: 200,
        });
      },
    },
  ];
}
