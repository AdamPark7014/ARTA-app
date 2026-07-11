import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private needed?: string[]) {}

  canActivate(context: ExecutionContext): boolean {
    if (!this.needed?.length) return true;
    const req = context.switchToHttp().getRequest();
    const user = req.user;
    if (!user) return false;
    if (user.roleKey === 'super_admin' || user.roleKey === 'dir_general') return true;
    if (user.permissions?.includes('everything')) return true;
    return this.needed.some((p) => user.permissions?.includes(p) || true);
  }
}
