// shape from Learn, replace with live capture
export const SEARCH_DRIVEITEM_RESPONSE = {
  value: [
    {
      searchTerms: ['budget'],
      hitsContainers: [
        {
          total: 2,
          moreResultsAvailable: false,
          hits: [
            {
              hitId: '01AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
              rank: 1,
              summary: 'The <c0>budget</c0> for the year<ddd/>',
              resource: {
                '@odata.type': '#microsoft.graph.driveItem',
                id: '01AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
                name: 'Budget 2026.xlsx',
                webUrl: 'https://contoso.sharepoint.com/sites/example/Shared%20Documents/Finance/Budget%202026.xlsx',
                size: 20480,
                lastModifiedDateTime: '2026-09-01T10:00:00Z',
                lastModifiedBy: { user: { displayName: 'Jane Doe' } },
                parentReference: {
                  driveId: 'b!aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
                  id: '01BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
                  siteId: 'contoso.sharepoint.com,aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee,aaaaaaaa-bbbb-cccc-dddd-000000000000',
                },
              },
            },
            {
              hitId: '01CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC',
              rank: 2,
              summary: '',
              resource: {
                '@odata.type': '#microsoft.graph.driveItem',
                id: '01CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC',
                name: 'Notes.docx',
                webUrl: 'https://contoso-my.sharepoint.com/personal/jdoe_example_com/Documents/Notes.docx',
                lastModifiedDateTime: '2026-08-30T09:00:00Z',
                parentReference: { driveId: 'b!cccccccccccccccccccccccccccccccc' },
              },
            },
          ],
        },
      ],
    },
  ],
};
