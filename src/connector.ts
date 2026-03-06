import { getCardBadges } from './capabilities/card-badges';
import { getCardButtons } from './capabilities/card-buttons';
import { getCardBackSection } from './capabilities/card-back-section';
import { getBoardButtons } from './capabilities/board-buttons';

const ICON_URL =
  'https://cdn-icons-png.flaticon.com/512/1995/1995515.png';

window.TrelloPowerUp.initialize({
  'card-buttons': (t: unknown) => getCardButtons(t, ICON_URL),
  'card-badges': (t: unknown) => getCardBadges(t),
  'card-back-section': (t: unknown) => getCardBackSection(t, ICON_URL),
  'board-buttons': (t: unknown) => getBoardButtons(t, ICON_URL),
});
