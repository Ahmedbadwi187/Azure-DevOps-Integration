import { Component, inject, OnInit, ChangeDetectorRef } from '@angular/core';
import { RouterLink, RouterLinkActive, Router } from '@angular/router';
import { DevOpsService } from '../../services/devops.service';
import { NgIf } from '@angular/common';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, NgIf],
  templateUrl: './sidebar.html',
  styleUrl: './sidebar.css',
  host: {
    '[class.collapsed]': 'isCollapsed'
  }
})
export class Sidebar implements OnInit {
  private readonly devOpsService = inject(DevOpsService);
  private readonly router = inject(Router);
  private readonly cdr = inject(ChangeDetectorRef);
  
  protected organizationName = '';
  protected isConfigured = false;
  protected isCollapsed = false;

  toggleCollapse() {
    this.isCollapsed = !this.isCollapsed;
    this.cdr.detectChanges();
  }

  ngOnInit() {
    this.checkConnection();
  }

  checkConnection() {
    this.devOpsService.getConnectionStatus().subscribe({
      next: (status) => {
        this.isConfigured = status.isConfigured;
        this.organizationName = status.organization || '';
        this.cdr.detectChanges();
      }
    });
  }

  logout() {
    localStorage.removeItem('devops_config');
    this.isConfigured = false;
    this.organizationName = '';
    this.cdr.detectChanges();
    this.router.navigate(['/connect']);
  }
}
