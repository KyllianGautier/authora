import { createHash } from 'crypto';
import { defaultTenantConfig } from '../../../config/tenant-config';
import { TenantSetting } from '../../../config/settings';
import type { SettingsService } from '../../../service/settings.service';
import { NoCommonPasswordConstraint } from './no-common-password.decorator';

describe('NoCommonPasswordConstraint', () => {
  function createConstraint(enabled = true) {
    const config = {
      ...defaultTenantConfig,
      passwordForbidCommonPassword: enabled
    };
    const mockSettingsService = {
      get: jest
        .fn()
        .mockImplementation((key: TenantSetting) =>
          Promise.resolve((config as any)[key])
        )
    } as unknown as SettingsService;
    return new NoCommonPasswordConstraint(mockSettingsService);
  }

  function pwnedResponseFor(password: string): string {
    const sha1 = createHash('sha1')
      .update(password)
      .digest('hex')
      .toUpperCase();
    const suffix = sha1.substring(5);
    return [
      'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA:3',
      `${suffix}:42`,
      'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB:1'
    ].join('\n');
  }

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should reject a breached password', async () => {
    const constraint = createConstraint();
    const password = 'Abcdef1!';
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      text: async () => pwnedResponseFor(password)
    } as Response);

    expect(await constraint.validate(password)).toBe(false);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('should accept a password not found in the breach list', async () => {
    const constraint = createConstraint();
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      text: async () =>
        'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA:3\nBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB:1'
    } as Response);

    expect(await constraint.validate('Abcdef1!')).toBe(true);
  });

  it('should pass (fail-open) when the API returns an error', async () => {
    const constraint = createConstraint();
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      status: 500
    } as Response);

    expect(await constraint.validate('Abcdef1!')).toBe(true);
  });

  it('should pass (fail-open) when the API is unreachable', async () => {
    const constraint = createConstraint();
    jest
      .spyOn(global, 'fetch')
      .mockRejectedValue(new Error('network error'));

    expect(await constraint.validate('Abcdef1!')).toBe(true);
  });

  it('should not call the API when disabled', async () => {
    const constraint = createConstraint(false);
    jest.spyOn(global, 'fetch');

    expect(await constraint.validate('Abcdef1!')).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
  });
});
