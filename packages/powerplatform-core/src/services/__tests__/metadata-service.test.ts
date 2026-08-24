import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MetadataService } from '../MetadataService.js';
import type { PowerPlatformClient } from '../../client/PowerPlatformClient.js';

const makeRequest = vi.fn();
const service = new MetadataService({ makeRequest } as unknown as PowerPlatformClient);

const picklistAttribute = () => ({
  '@odata.type': '#Microsoft.Dynamics.CRM.PicklistAttributeMetadata',
  LogicalName: 'sample_category',
  AttributeType: 'Picklist',
});

const optionSetPayload = () => ({
  Name: 'sample_category_options',
  IsGlobal: false,
  Options: [
    { Value: 1, Label: { UserLocalizedLabel: { Label: 'Alpha' } } },
    { Value: 2, Label: { UserLocalizedLabel: { Label: 'Beta' } } },
  ],
});

describe('MetadataService.getEntityAttribute', () => {
  beforeEach(() => {
    makeRequest.mockReset();
  });

  it('returns option values from $expand=OptionSet on the success path (shape unchanged)', async () => {
    makeRequest
      // 1: base attribute fetch
      .mockResolvedValueOnce(picklistAttribute())
      // 2: cast request with $expand=OptionSet
      .mockResolvedValueOnce({ OptionSet: optionSetPayload() });

    const result = (await service.getEntityAttribute('account', 'sample_category')) as any;

    expect(result.OptionSet.Options).toEqual([
      { Value: 1, Label: 'Alpha', Description: '' },
      { Value: 2, Label: 'Beta', Description: '' },
    ]);
    expect(result.optionSetWarning).toBeUndefined();
    expect(makeRequest).toHaveBeenCalledTimes(2);
  });

  // Regression: $expand=OptionSet was observed to fail for local picklists; the
  // failure was swallowed and the attribute returned without options or warning.
  it('falls back to the attribute-scoped OptionSet request when expansion fails', async () => {
    makeRequest
      .mockResolvedValueOnce(picklistAttribute())
      .mockRejectedValueOnce(new Error('expand failed'))
      // 3: fallback - direct .../{castType}/OptionSet navigation-property read
      .mockResolvedValueOnce(optionSetPayload());

    const result = (await service.getEntityAttribute('account', 'sample_category')) as any;

    expect(result.OptionSet.Options).toEqual([
      { Value: 1, Label: 'Alpha', Description: '' },
      { Value: 2, Label: 'Beta', Description: '' },
    ]);
    expect(result.optionSetWarning).toBeUndefined();
    const fallbackUrl = makeRequest.mock.calls[2][0] as string;
    expect(fallbackUrl).toContain(
      "Attributes(LogicalName='sample_category')/Microsoft.Dynamics.CRM.PicklistAttributeMetadata/OptionSet"
    );
  });

  it('falls back to GlobalOptionSet when expansion succeeds without options (global picklist)', async () => {
    makeRequest
      .mockResolvedValueOnce(picklistAttribute())
      // 2: expansion "succeeds" but OptionSet is null - global picklist behaviour
      .mockResolvedValueOnce({ OptionSet: null })
      // 3: local OptionSet nav property is empty too
      .mockResolvedValueOnce(null)
      // 4: GlobalOptionSet nav property has the options
      .mockResolvedValueOnce({ ...optionSetPayload(), IsGlobal: true });

    const result = (await service.getEntityAttribute('account', 'sample_category')) as any;

    expect(result.OptionSet.IsGlobal).toBe(true);
    expect(result.OptionSet.Options).toHaveLength(2);
    expect(result.optionSetWarning).toBeUndefined();
  });

  it('sets an explicit optionSetWarning when expansion and all fallbacks fail', async () => {
    makeRequest
      .mockResolvedValueOnce(picklistAttribute())
      .mockRejectedValueOnce(new Error('expand failed'))
      .mockRejectedValueOnce(new Error('OptionSet nav failed'))
      .mockRejectedValueOnce(new Error('GlobalOptionSet nav failed'));

    const result = (await service.getEntityAttribute('account', 'sample_category')) as any;

    expect(result.OptionSet).toBeUndefined();
    expect(result.optionSetWarning).toContain('sample_category');
    expect(result.optionSetWarning).toContain('option values omitted');
  });

  it('does not attempt option-set requests for non-picklist attributes', async () => {
    makeRequest.mockResolvedValueOnce({
      '@odata.type': '#Microsoft.Dynamics.CRM.StringAttributeMetadata',
      LogicalName: 'sample_name',
      AttributeType: 'String',
    });

    const result = (await service.getEntityAttribute('account', 'sample_name')) as any;

    expect(result.optionSetWarning).toBeUndefined();
    expect(makeRequest).toHaveBeenCalledTimes(1);
  });
});
