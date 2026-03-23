import { defaultTenantConfig } from '../../../config/tenant-config';
import { NoKeyboardSequenceConstraint } from './no-keyboard-sequence.decorator';

describe('NoKeyboardSequenceConstraint', () => {
  function createConstraint(enabled = true) {
    return new NoKeyboardSequenceConstraint({
      ...defaultTenantConfig,
      passwordForbidKeyboardSequence: enabled
    });
  }

  describe('number row (shared)', () => {
    it('should reject sequences', () => {
      const constraint = createConstraint();
      expect(constraint.validate('X1234aX!')).toBe(false);
      expect(constraint.validate('X5678aX!')).toBe(false);
      expect(constraint.validate('X7890aX!')).toBe(false);
    });

    it('should reject reversed sequences', () => {
      const constraint = createConstraint();
      expect(constraint.validate('X4321aX!')).toBe(false);
      expect(constraint.validate('X8765aX!')).toBe(false);
      expect(constraint.validate('X0987aX!')).toBe(false);
    });
  });

  describe('QWERTY (EN/ES)', () => {
    it('should reject top row sequences', () => {
      const constraint = createConstraint();
      expect(constraint.validate('Xqwer55!')).toBe(false);
      expect(constraint.validate('Xwert55!')).toBe(false);
      expect(constraint.validate('Xerty55!')).toBe(false);
      expect(constraint.validate('Xtyui55!')).toBe(false);
      expect(constraint.validate('Xuiop55!')).toBe(false);
    });

    it('should reject reversed top row sequences', () => {
      const constraint = createConstraint();
      expect(constraint.validate('Xrewq55!')).toBe(false);
      expect(constraint.validate('Xtrew55!')).toBe(false);
      expect(constraint.validate('Xytre55!')).toBe(false);
      expect(constraint.validate('Xpoiu55!')).toBe(false);
    });

    it('should reject middle row sequences', () => {
      const constraint = createConstraint();
      expect(constraint.validate('Xasdf55!')).toBe(false);
      expect(constraint.validate('Xsdfg55!')).toBe(false);
      expect(constraint.validate('Xghjk55!')).toBe(false);
      expect(constraint.validate('Xhjkl55!')).toBe(false);
    });

    it('should reject reversed middle row sequences', () => {
      const constraint = createConstraint();
      expect(constraint.validate('Xfdsa55!')).toBe(false);
      expect(constraint.validate('Xgfds55!')).toBe(false);
      expect(constraint.validate('Xkjhg55!')).toBe(false);
      expect(constraint.validate('Xlkjh55!')).toBe(false);
    });

    it('should reject bottom row sequences', () => {
      const constraint = createConstraint();
      expect(constraint.validate('Xzxcv55!')).toBe(false);
      expect(constraint.validate('Xxcvb55!')).toBe(false);
      expect(constraint.validate('Xcvbn55!')).toBe(false);
    });

    it('should reject reversed bottom row sequences', () => {
      const constraint = createConstraint();
      expect(constraint.validate('Xvcxz55!')).toBe(false);
      expect(constraint.validate('Xbvcx55!')).toBe(false);
      expect(constraint.validate('Xnbvc55!')).toBe(false);
    });
  });

  describe('AZERTY (FR)', () => {
    it('should reject top row sequences', () => {
      const constraint = createConstraint();
      expect(constraint.validate('Xazer55!')).toBe(false);
      expect(constraint.validate('Xzert55!')).toBe(false);
      expect(constraint.validate('Xerty55!')).toBe(false);
      expect(constraint.validate('Xtyui55!')).toBe(false);
      expect(constraint.validate('Xuiop55!')).toBe(false);
    });

    it('should reject reversed top row sequences', () => {
      const constraint = createConstraint();
      expect(constraint.validate('Xreza55!')).toBe(false);
      expect(constraint.validate('Xtrez55!')).toBe(false);
      expect(constraint.validate('Xpoiu55!')).toBe(false);
    });

    it('should reject middle row sequences', () => {
      const constraint = createConstraint();
      expect(constraint.validate('Xqsdf55!')).toBe(false);
      expect(constraint.validate('Xsdfg55!')).toBe(false);
      expect(constraint.validate('Xghjk55!')).toBe(false);
      expect(constraint.validate('Xjklm55!')).toBe(false);
    });

    it('should reject reversed middle row sequences', () => {
      const constraint = createConstraint();
      expect(constraint.validate('Xfdsq55!')).toBe(false);
      expect(constraint.validate('Xgfds55!')).toBe(false);
      expect(constraint.validate('Xkjhg55!')).toBe(false);
      expect(constraint.validate('Xmlkj55!')).toBe(false);
    });

    it('should reject bottom row sequences', () => {
      const constraint = createConstraint();
      expect(constraint.validate('Xwxcv55!')).toBe(false);
      expect(constraint.validate('Xxcvb55!')).toBe(false);
    });

    it('should reject reversed bottom row sequences', () => {
      const constraint = createConstraint();
      expect(constraint.validate('Xvcxw55!')).toBe(false);
      expect(constraint.validate('Xnbvcx5!')).toBe(false);
    });
  });

  describe('QWERTZ (DE)', () => {
    it('should reject top row sequences', () => {
      const constraint = createConstraint();
      expect(constraint.validate('Xqwer55!')).toBe(false);
      expect(constraint.validate('Xwert55!')).toBe(false);
      expect(constraint.validate('Xertz55!')).toBe(false);
      expect(constraint.validate('Xrtzu55!')).toBe(false);
      expect(constraint.validate('Xtzui55!')).toBe(false);
      expect(constraint.validate('Xuiop55!')).toBe(false);
    });

    it('should reject reversed top row sequences', () => {
      const constraint = createConstraint();
      expect(constraint.validate('Xztre55!')).toBe(false);
      expect(constraint.validate('Xuztr55!')).toBe(false);
      expect(constraint.validate('Xpoiu55!')).toBe(false);
    });

    it('should reject bottom row sequences', () => {
      const constraint = createConstraint();
      expect(constraint.validate('Xyxcv55!')).toBe(false);
      expect(constraint.validate('Xxcvb55!')).toBe(false);
      expect(constraint.validate('Xcvbn55!')).toBe(false);
    });

    it('should reject reversed bottom row sequences', () => {
      const constraint = createConstraint();
      expect(constraint.validate('Xvcxy55!')).toBe(false);
      expect(constraint.validate('Xbvcx55!')).toBe(false);
      expect(constraint.validate('Xnbvc55!')).toBe(false);
    });
  });

  describe('general', () => {
    it('should be case-insensitive', () => {
      const constraint = createConstraint();
      expect(constraint.validate('XQWER55!')).toBe(false);
      expect(constraint.validate('XAZER55!')).toBe(false);
      expect(constraint.validate('XERTZ55!')).toBe(false);
    });

    it('should accept 3 keyboard-adjacent characters (below threshold)', () => {
      expect(createConstraint().validate('Xqwe555!')).toBe(true);
      expect(createConstraint().validate('Xaze555!')).toBe(true);
      expect(createConstraint().validate('Xyxc555!')).toBe(true);
    });

    it('should accept any password when disabled', () => {
      expect(createConstraint(false).validate('Xqwer55!')).toBe(true);
    });
  });
});
