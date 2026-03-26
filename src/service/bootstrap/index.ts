import { ApiKeyBootstrapService } from './api-key-bootstrap.service';
import { AuthoraConfigBootstrapService } from './authora-config-bootstrap.service';
import { TenantBootstrapService } from './tenant-bootstrap.service';
import { TenantConfigBootstrapService } from './tenant-config-bootstrap.service';

export const BOOTSTRAP_SERVICES = [
  ApiKeyBootstrapService,
  AuthoraConfigBootstrapService,
  TenantBootstrapService,
  TenantConfigBootstrapService
];