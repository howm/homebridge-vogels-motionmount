import add from '../index';

describe('super lib', () => {
  it('should add with success', () => {
    expect(add(2, 3)).toEqual(5);
  });
});
