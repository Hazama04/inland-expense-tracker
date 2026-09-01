import { auditRepository, AuditLogFindManyFilters } from '../repositories/audit.repository';
import { Actor, Permissions, requireRole } from '../lib/auth/authorization';

export class AuditService {
  /**
   * List audit logs with pagination and filters. Restricted to ADMIN role.
   */
  async listAuditLogs(
    actor: Actor,
    filters: AuditLogFindManyFilters & { page?: number; pageSize?: number } = {}
  ) {
    requireRole(actor, Permissions.VIEW_AUDIT_LOGS);

    const page = filters.page ?? 1;
    const pageSize = filters.pageSize ?? 20;
    const skip = (page - 1) * pageSize;

    const [items, total] = await Promise.all([
      auditRepository.findMany({ ...filters, skip, take: pageSize }),
      auditRepository.count(filters),
    ]);

    return {
      items,
      meta: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }
}

export const auditService = new AuditService();
