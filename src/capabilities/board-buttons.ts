import type { TrelloContext } from '../types';

export function getBoardButtons(t: unknown, icon: string) {
  return [
    {
      icon,
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
