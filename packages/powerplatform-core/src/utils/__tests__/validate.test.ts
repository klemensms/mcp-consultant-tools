import { describe, it, expect } from 'vitest';
import {
  assertActionName,
  assertGuid,
  assertIdentifier,
  assertPositiveWholeNumber,
} from '../validate.js';

describe('assertIdentifier', () => {
  it.each([
    'accounts',
    'contact',
    'new_customtable',
    'cr123_Thing',
    '_parentcustomerid_value',
    'new_eventpackageadditional_new_eventd',
  ])('accepts %s', (name) => {
    expect(() => assertIdentifier(name, 'table name')).not.toThrow();
  });

  it.each([
    '',
    'accounts?$select=name',
    'accounts(aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee)',
    'contacts/../systemusers',
    "account'",
    'account name',
    '1account',
    'new-thing',
    'accounts#',
  ])('rejects %j', (name) => {
    expect(() => assertIdentifier(name, 'table name')).toThrow(/Invalid table name/);
  });

  it('rejects a non-string', () => {
    expect(() => assertIdentifier(undefined as unknown as string, 'column name')).toThrow(
      /Invalid column name/
    );
  });
});

describe('assertGuid', () => {
  it('accepts a GUID in either case', () => {
    expect(() => assertGuid('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee')).not.toThrow();
    expect(() => assertGuid('AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE')).not.toThrow();
  });

  it.each(['', '1234', 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee)/x', "name='x'"])(
    'rejects %j with the existing message',
    (id) => {
      expect(() => assertGuid(id)).toThrow(/Invalid record ID format: .*Must be a valid GUID\./);
    }
  );

  it('names the field it checked', () => {
    expect(() => assertGuid('x', 'target record ID')).toThrow(/Invalid target record ID format/);
  });
});

describe('assertActionName', () => {
  it.each(['WhoAmI', 'new_MyAction', 'Microsoft.Dynamics.CRM.QualifyLead'])('accepts %s', (name) => {
    expect(() => assertActionName(name)).not.toThrow();
  });

  it.each(['', 'WhoAmI?x=1', 'a/b', '.WhoAmI', 'Who Am I'])('rejects %j', (name) => {
    expect(() => assertActionName(name)).toThrow(/Invalid action name/);
  });
});

describe('assertPositiveWholeNumber', () => {
  it.each([1, 50, 5000, 100000])('accepts %s', (n) => {
    expect(() => assertPositiveWholeNumber(n, 'maxRecords')).not.toThrow();
  });

  it.each([0, -5, 1.5, NaN, Infinity])('rejects %s', (n) => {
    expect(() => assertPositiveWholeNumber(n, 'maxRecords')).toThrow(
      /maxRecords must be a whole number of 1 or more/
    );
  });
});
