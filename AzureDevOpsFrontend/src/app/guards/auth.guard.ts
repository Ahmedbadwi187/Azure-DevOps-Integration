import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { DevOpsService } from '../services/devops.service';
import { map, catchError } from 'rxjs/operators';
import { of } from 'rxjs';

export const authGuard: CanActivateFn = (route, state) => {
  const devOpsService = inject(DevOpsService);
  const router = inject(Router);

  return devOpsService.getConnectionStatus().pipe(
    map(status => {
      if (status.isConfigured) {
        return true;
      } else {
        router.navigate(['/connect']);
        return false;
      }
    }),
    catchError(() => {
      router.navigate(['/connect']);
      return of(false);
    })
  );
};
