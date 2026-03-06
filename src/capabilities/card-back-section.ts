export async function getCardBackSection(t: any, icon: string) {
  const data = await t.get('card', 'shared', 'holdedData');

  if (!data || (!data.contactName && !data.projectName)) return null;

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
