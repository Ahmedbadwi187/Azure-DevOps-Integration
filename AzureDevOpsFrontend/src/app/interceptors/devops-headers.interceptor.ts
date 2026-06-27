import { HttpInterceptorFn } from '@angular/common/http';

export const devOpsHeadersInterceptor: HttpInterceptorFn = (req, next) => {
  const configStr = localStorage.getItem('devops_config');
  if (configStr) {
    try {
      // Base64 encode the configuration JSON string
      const base64Config = btoa(configStr);
      const clonedReq = req.clone({
        setHeaders: {
          'X-DevOps-Config': base64Config
        }
      });
      return next(clonedReq);
    } catch (e) {
      console.error('Failed to base64 encode devops_config', e);
    }
  }
  return next(req);
};
