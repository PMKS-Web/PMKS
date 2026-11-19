import { describeError } from './analytics-events';

describe('describeError', () => {
  it('names the error and says what it was', () => {
    expect(describeError(new TypeError('Cannot read properties of undefined'))).toBe(
      'TypeError: Cannot read properties of undefined'
    );
  });

  // A message can quote a name the reader typed, or a value from the drawing.
  it('cuts out what the message quotes, and every number', () => {
    expect(describeError(new Error("No link named 'Crank arm' at 12.5, -3"))).toBe(
      'Error: No link named … at #, -#'
    );
  });

  // A link that would not decode can quote its own payload, which is the
  // reader's drawing.
  it('cuts out anything shaped like a mechanism payload', () => {
    const payload = '2v.Fe,1E8.A,0.1011.6A,A,0mv,0VU,0.0B,B,0e_,E6,0.0C,C,l1,WW';
    expect(describeError(new Error(`Could not decode ${payload}`))).toBe(
      'Error: Could not decode …'
    );
  });

  it('keeps within the length GA keeps', () => {
    expect(describeError('word '.repeat(60)).length).toBeLessThanOrEqual(100);
  });

  it("keeps Angular's own error codes, which are not the reader's", () => {
    expect(describeError(new Error('NG0100: Expression has changed'))).toBe(
      'Error: NG0100: Expression has changed'
    );
  });

  it('says something for a thrown value that is not an error', () => {
    expect(describeError({ code: 3 })).toBe('Unknown error');
  });
});
