import { TenantBootstrapService } from './tenant-bootstrap.service';
import { ApiKeyBootstrapService } from './api-key-bootstrap.service';

export const BOOTSTRAP_SERVICES = [
  ApiKeyBootstrapService,
  TenantBootstrapService
];