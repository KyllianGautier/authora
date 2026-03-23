import { defaultTenantConfig } from '../../../config/tenant-config';
import { TenantSetting } from '../../../config/settings';
import type { SettingsService } from '../../../service/settings.service';
import { NoKeyboardSequenceConstraint } from './no-keyboard-sequence.decorator';

describe('NoKeyboardSequenceConstraint', () => {
  function createConstraint(enabled = true) {
    const config = {
      ...defaultTenantConfig,
      passwordForbidKeyboardSequence: enabled
    };
    const mockSettingsService = {
      get: jest
        .fn()
        .mockImplementation((key: TenantSetting) =>
          Promise.resolve((config as any)[key])
        )
    } as unknown as SettingsService;
    return new NoKeyboardSequenceConstraint(mockSettingsService);
  }

  describe('number row (shared)', () => {
    it('should reject sequences', async () => {
      const constraint = createConstraint();
      expect(await constraint.validate('X1234aX!')).toBe(false);
      expect(await constraint.validate('X5678aX!')).toBe(false);
      expect(await constraint.validate('X7890aX!')).toBe(false);
    });

    it('should reject reversed sequences', async () => {
      const constraint = createConstraint();
      expect(await constraint.validate('X4321aX!')).toBe(false);
      expect(await constraint.validate('X8765aX!')).toBe(false);
      expect(await constraint.validate('X0987aX!')).toBe(false);
    });
  });

  describe('QWERTY (EN/ES)', () => {
    it('should reject top row sequences', async () => {
      const constraint = createConstraint();
      expect(await constraint.validate('Xqwer55!')).toBe(false);
      expect(await constraint.validate('Xwert55!')).toBe(false);
      expect(await constraint.validate('Xerty55!')).toBe(false);
      expect(await constraint.validate('Xtyui55!')).toBe(false);
      expect(await constraint.validate('Xuiop55!')).toBe(false);
    });

    it('should reject reversed top row sequences', async () => {
      const constraint = createConstraint();
      expect(await constraint.validate('Xrewq55!')).toBe(false);
      expect(await constraint.validate('Xtrew55!')).toBe(false);
      expect(await constraint.validate('Xytre55!')).toBe(false);
      expect(await constraint.validate('Xpoiu55!')).toBe(false);
    });

    it('should reject middle row sequences', async () => {
      const constraint = createConstraint();
      expect(await constraint.validate('Xasdf55!')).toBe(false);
      expect(await constraint.validate('Xsdfg55!')).toBe(false);
      expect(await constraint.validate('Xghjk55!')).toBe(false);
      expect(await constraint.validate('Xhjkl55!')).toBe(false);
    });

    it('should reject reversed middle row sequences', async () => {
      const constraint = createConstraint();
      expect(await constraint.validate('Xfdsa55!')).toBe(false);
      expect(await constraint.validate('Xgfds55!')).toBe(false);
      expect(await constraint.validate('Xkjhg55!')).toBe(false);
      expect(await constraint.validate('Xlkjh55!')).toBe(false);
    });

    it('should reject bottom row sequences', async () => {
      const constraint = createConstraint();
      expect(await constraint.validate('Xzxcv55!')).toBe(false);
      expect(await constraint.validate('Xxcvb55!')).toBe(false);
      expect(await constraint.validate('Xcvbn55!')).toBe(false);
    });

    it('should reject reversed bottom row sequences', async () => {
      const constraint = createConstraint();
      expect(await constraint.validate('Xvcxz55!')).toBe(false);
      expect(await constraint.validate('Xbvcx55!')).toBe(false);
      expect(await constraint.validate('Xnbvc55!')).toBe(false);
    });
  });

  describe('AZERTY (FR)', () => {
    it('should reject top row sequences', async () => {
      const constraint = createConstraint();
      expect(await constraint.validate('Xazer55!')).toBe(false);
      expect(await constraint.validate('Xzert55!')).toBe(false);
      expect(await constraint.validate('Xerty55!')).toBe(false);
      expect(await constraint.validate('Xtyui55!')).toBe(false);
      expect(await constraint.validate('Xuiop55!')).toBe(false);
    });

    it('should reject reversed top row sequences', async () => {
      const constraint = createConstraint();
      expect(await constraint.validate('Xreza55!')).toBe(false);
      expect(await constraint.validate('Xtrez55!')).toBe(false);
      expect(await constraint.validate('Xpoiu55!')).toBe(false);
    });

    it('should reject middle row sequences', async () => {
      const constraint = createConstraint();
      expect(await constraint.validate('Xqsdf55!')).toBe(false);
      expect(await constraint.validate('Xsdfg55!')).toBe(false);
      expect(await constraint.validate('Xghjk55!')).toBe(false);
      expect(await constraint.validate('Xjklm55!')).toBe(false);
    });

    it('should reject reversed middle row sequences', async () => {
      const constraint = createConstraint();
      expect(await constraint.validate('Xfdsq55!')).toBe(false);
      expect(await constraint.validate('Xgfds55!')).toBe(false);
      expect(await constraint.validate('Xkjhg55!')).toBe(false);
      expect(await constraint.validate('Xmlkj55!')).toBe(false);
    });

    it('should reject bottom row sequences', async () => {
      const constraint = createConstraint();
      expect(await constraint.validate('Xwxcv55!')).toBe(false);
      expect(await constraint.validate('Xxcvb55!')).toBe(false);
    });

    it('should reject reversed bottom row sequences', async () => {
      const constraint = createConstraint();
      expect(await constraint.validate('Xvcxw55!')).toBe(false);
      expect(await constraint.validate('Xnbvcx5!')).toBe(false);
    });
  });

  describe('QWERTZ (DE)', () => {
    it('should reject top row sequences', async () => {
      const constraint = createConstraint();
      expect(await constraint.validate('Xqwer55!')).toBe(false);
      expect(await constraint.validate('Xwert55!')).toBe(false);
      expect(await constraint.validate('Xertz55!')).toBe(false);
      expect(await constraint.validate('Xrtzu55!')).toBe(false);
      expect(await constraint.validate('Xtzui55!')).toBe(false);
      expect(await constraint.validate('Xuiop55!')).toBe(false);
    });

    it('should reject reversed top row sequences', async () => {
      const constraint = createConstraint();
      expect(await constraint.validate('Xztre55!')).toBe(false);
      expect(await constraint.validate('Xuztr55!')).toBe(false);
      expect(await constraint.validate('Xpoiu55!')).toBe(false);
    });

    it('should reject bottom row sequences', async () => {
      const constraint = createConstraint();
      expect(await constraint.validate('Xyxcv55!')).toBe(false);
      expect(await constraint.validate('Xxcvb55!')).toBe(false);
      expect(await constraint.validate('Xcvbn55!')).toBe(false);
    });

    it('should reject reversed bottom row sequences', async () => {
      const constraint = createConstraint();
      expect(await constraint.validate('Xvcxy55!')).toBe(false);
      expect(await constraint.validate('Xbvcx55!')).toBe(false);
      expect(await constraint.validate('Xnbvc55!')).toBe(false);
    });
  });

  describe('general', () => {
    it('should be case-insensitive', async () => {
      const constraint = createConstraint();
      expect(await constraint.validate('XQWER55!')).toBe(false);
      expect(await constraint.validate('XAZER55!')).toBe(false);
      expect(await constraint.validate('XERTZ55!')).toBe(false);
    });

    it('should accept 3 keyboard-adjacent characters (below threshold)', async () => {
      expect(await createConstraint().validate('Xqwe555!')).toBe(true);
      expect(await createConstraint().validate('Xaze555!')).toBe(true);
      expect(await createConstraint().validate('Xyxc555!')).toBe(true);
    });

    it('should accept any password when disabled', async () => {
      expect(await createConstraint(false).validate('Xqwer55!')).toBe(true);
    });
  });
});
