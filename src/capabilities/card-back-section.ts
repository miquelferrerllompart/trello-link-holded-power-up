// The section always renders so the card-back can show the "Vincula un
// cliente/proyecto" prompts even when nothing is linked yet.
export async function getCardBackSection(t: any, icon: string) {
  return {
    title: 'Holded',
    icon,
    content: {
      type: 'iframe',
      url: t.signUrl('./card-back.html'),
      height: 100,
    },
  };
}
