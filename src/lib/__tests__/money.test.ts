import { convertMinorToBase, fromMinor, toMinor } from '../money';

describe('money helpers', () => {
  it('converts major values to integer minor units by currency precision', () => {
    expect(toMinor(12.34, 'USD')).toBe(1234);
    expect(toMinor(12.34, 'UZS')).toBe(12);
    expect(toMinor(1.234, 'JOD')).toBe(1234);
  });

  it('converts minor values back to major display units', () => {
    expect(fromMinor(1234, 'USD')).toBe(12.34);
    expect(fromMinor(1234, 'JOD')).toBe(1.234);
  });

  it('uses stored FX snapshots for base conversion math', () => {
    expect(convertMinorToBase(10000, 12500, 'USD', 'UZS')).toBe(1250000);
  });
});
