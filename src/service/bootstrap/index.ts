import { AdminUserBootstrapService } from './admin-user-bootstrap.service';
import { ApiKeyBootstrapService } from './api-key-bootstrap.service';
import { AuthoraConfigBootstrapService } from './authora-config-bootstrap.service';
import { TenantBootstrapService } from './tenant-bootstrap.service';
import { TenantConfigBootstrapService } from './tenant-config-bootstrap.service';

export const BOOTSTRAP_SERVICES = [
  AdminUserBootstrapService,
  ApiKeyBootstrapService,
  AuthoraConfigBootstrapService,
  TenantBootstrapService,
  TenantConfigBootstrapService
];