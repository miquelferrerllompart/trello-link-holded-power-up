import { getCardBadges, getCardDetailBadges } from './capabilities/card-badges';
import { getCardButtons } from './capabilities/card-buttons';
import { getCardBackSection } from './capabilities/card-back-section';
import { HOLDED_ICON_URL } from './icons';
import { TRELLO_APP_KEY } from './config';

window.TrelloPowerUp.initialize(
  {
    'board-buttons': () => [],
    'card-buttons': (t: unknown) => getCardButtons(t),
    'card-badges': (t: unknown) => getCardBadges(t),
    'card-detail-badges': (t: unknown) => getCardDetailBadges(t),
    'card-back-section': (t: unknown) => getCardBackSection(t, HOLDED_ICON_URL),
    'list-sorters': () => [],
    'save-attachment': () => ({
      callback: () => undefined,
    }),
  },
  {
    appKey: TRELLO_APP_KEY,
    appName: 'Holded',
  }
);
