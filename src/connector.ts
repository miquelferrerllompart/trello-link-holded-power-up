import { getCardBadges } from './capabilities/card-badges';
import { getCardButtons } from './capabilities/card-buttons';
import { getCardBackSection } from './capabilities/card-back-section';
import { HOLDED_ICON_URL } from './icons';
import { TRELLO_APP_KEY } from './config';

window.TrelloPowerUp.initialize(
  {
    'card-buttons': (t: unknown) => getCardButtons(t),
    'card-badges': (t: unknown) => getCardBadges(t),
    'card-back-section': (t: unknown) => getCardBackSection(t, HOLDED_ICON_URL),
  },
  {
    appKey: TRELLO_APP_KEY,
    appName: 'Holded',
  }
);
