import { getCardBadges } from './capabilities/card-badges';
import { getCardButtons } from './capabilities/card-buttons';
import { getCardBackSection } from './capabilities/card-back-section';
import { getCardFilter } from './capabilities/card-filter';
import { HOLDED_ICON_URL } from './icons';

window.TrelloPowerUp.initialize({
  'card-buttons': (t: unknown) => getCardButtons(t),
  'card-badges': (t: unknown) => getCardBadges(t),
  'card-back-section': (t: unknown) => getCardBackSection(t, HOLDED_ICON_URL),
  'filter-card': (t: unknown) => getCardFilter(t),
});
