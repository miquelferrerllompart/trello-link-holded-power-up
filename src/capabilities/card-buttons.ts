import type { TrelloContext } from '../types';
import { CONTACT_ICON, PROJECT_ICON } from '../icons';

export function getCardButtons(t: unknown) {
  return [
    {
      icon: CONTACT_ICON,
      text: 'Vincular cliente',
      callback: (ctx: TrelloContext) => {
        ctx.popup({
          title: 'Buscar cliente en Holded',
          url: './src/popups/search-contact.html',
          height: 400,
        });
      },
    },
    {
      icon: PROJECT_ICON,
      text: 'Vincular proyecto',
      callback: (ctx: TrelloContext) => {
        ctx.popup({
          title: 'Buscar proyecto en Holded',
          url: './src/popups/search-project.html',
          height: 400,
        });
      },
    },
  ];
}
