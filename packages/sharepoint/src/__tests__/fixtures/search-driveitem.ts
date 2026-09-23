/**
 * Microsoft Search driveItem response. Hit 1 has the shape a live delegated
 * search returned on 2026-09-23 (Sites.ReadWrite.All, no Files.*), with every
 * identifier and name replaced by a placeholder. Hit 2 is deliberately sparse,
 * to pin that a hit missing optional fields still maps.
 */
export const SEARCH_DRIVEITEM_RESPONSE = {
  '@odata.context': 'https://graph.microsoft.com/v1.0/$metadata#Collection(microsoft.graph.searchResponse)',
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
                size: 20480,
                fileSystemInfo: { createdDateTime: '2026-08-01T09:00:00Z', lastModifiedDateTime: '2026-09-01T10:00:00Z' },
                file: { mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
                listItem: { '@odata.type': '#microsoft.graph.listItem', id: 'aaaaaaaa-bbbb-cccc-dddd-111111111111', fields: {} },
                id: '01AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
                createdBy: { user: { displayName: 'Jane Doe', email: 'jdoe@example.com' } },
                createdDateTime: '2026-08-01T09:00:00Z',
                lastModifiedBy: { user: { displayName: 'Jane Doe', email: 'jdoe@example.com' } },
                lastModifiedDateTime: '2026-09-01T10:00:00Z',
                name: 'Budget 2026.xlsx',
                parentReference: {
                  driveId: 'b!aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
                  id: '01BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
                  sharepointIds: {
                    listId: 'aaaaaaaa-bbbb-cccc-dddd-222222222222',
                    listItemId: '12',
                    listItemUniqueId: 'aaaaaaaa-bbbb-cccc-dddd-111111111111',
                  },
                  siteId: 'contoso.sharepoint.com,aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee,aaaaaaaa-bbbb-cccc-dddd-000000000000',
                },
                webUrl: 'https://contoso.sharepoint.com/sites/example/Shared%20Documents/Finance/Budget%202026.xlsx',
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
