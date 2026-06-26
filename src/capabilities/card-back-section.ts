export async function getCardBackSection(t: any, icon: string) {
  const data = await t.get('card', 'shared', 'holdedData').catch((err: unknown) => {
    console.error('Holded: error loading card back section', err);
    return null;
  });

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
