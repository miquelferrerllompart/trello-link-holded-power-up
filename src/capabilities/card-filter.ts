import type { TrelloContext, CardHoldedData } from '../types';
import { HOLDED_ICON_URL } from '../icons';

interface FilterContext extends TrelloContext {
  popup(options: { title: string; url: string; height?: number; search?: { placeholder?: string } }): void;
}

export function getCardFilter(t: unknown) {
  const ctx = t as FilterContext;
  return [
    {
      text: 'Holded',
      icon: HOLDED_ICON_URL,
      callback: (filterCtx: FilterContext) => {
        return filterCtx.popup({
          title: 'Filtrar por Holded',
          url: './src/popups/filter.html',
          height: 400,
        });
      },
      filterCard: async (cardCtx: TrelloContext, filterData: { contactIds?: string[]; projectIds?: string[] }) => {
        const data = (await cardCtx.get('card', 'shared', 'holdedData')) as CardHoldedData | null;
        if (!data) {
          return (filterData.contactIds?.length || 0) === 0 && (filterData.projectIds?.length || 0) === 0;
        }

        const contactMatch = !filterData.contactIds?.length || (data.contactId && filterData.contactIds.includes(data.contactId));
        const projectMatch = !filterData.projectIds?.length || (data.projectId && filterData.projectIds.includes(data.projectId));

        return Boolean(contactMatch && projectMatch);
      },
    },
  ];
}
