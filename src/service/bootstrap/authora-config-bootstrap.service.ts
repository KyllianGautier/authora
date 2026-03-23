import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { AuthoraConfigEntityService } from '../entity-service/authora-config-entity.service';


const DEFAULT_AUTHORA_CONFIG_NAME = 'Default';

@Injectable()
export class AuthoraConfigBootstrapService implements OnApplicationBootstrap {
  constructor(
    private readonly _authoraConfigService: AuthoraConfigEntityService
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const active = await this._authoraConfigService.findActive();

    if (active !== null) return;

    await this._authoraConfigService.create({
      name: DEFAULT_AUTHORA_CONFIG_NAME,
      isActive: true
    });
  }
}
