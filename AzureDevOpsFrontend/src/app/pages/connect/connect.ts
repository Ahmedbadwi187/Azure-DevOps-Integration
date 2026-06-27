import { Component, inject, OnInit, ChangeDetectorRef } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { DevOpsService } from '../../services/devops.service';
import { NgIf } from '@angular/common';

@Component({
  selector: 'app-connect',
  standalone: true,
  imports: [FormsModule, NgIf],
  templateUrl: './connect.html',
  styleUrl: './connect.css'
})
export class Connect implements OnInit {
  private readonly devOpsService = inject(DevOpsService);
  protected readonly router = inject(Router);
  private readonly cdr = inject(ChangeDetectorRef);

  protected org = '';
  protected pat = '';
  protected authType: 'pat' | 'credentials' = 'pat';
  protected baseUrl = '';
  protected username = '';
  protected password = '';

  protected isLoading = false;
  protected isConfigured = false;
  protected currentOrg = '';
  protected errorMessage = '';
  protected successMessage = '';

  ngOnInit() {
    this.checkStatus();
  }

  checkStatus() {
    this.isLoading = true;
    this.cdr.detectChanges();
    this.devOpsService.getConnectionStatus().subscribe({
      next: (res) => {
        this.isConfigured = res.isConfigured;
        this.currentOrg = res.organization || '';
        this.isLoading = false;
        this.cdr.detectChanges();
        if (res.isConfigured) {
          this.router.navigate(['/dashboard']);
        }
      },
      error: () => {
        this.isLoading = false;
        this.cdr.detectChanges();
      }
    });
  }

  onSubmit() {
    if (!this.org) {
      this.errorMessage = 'Organization Name is required.';
      this.cdr.detectChanges();
      return;
    }

    if (this.authType === 'pat' && !this.pat) {
      this.errorMessage = 'Personal Access Token is required.';
      this.cdr.detectChanges();
      return;
    }

    if (this.authType === 'credentials' && (!this.username || !this.password)) {
      this.errorMessage = 'Username and Password are required.';
      this.cdr.detectChanges();
      return;
    }

    this.isLoading = true;
    this.errorMessage = '';
    this.successMessage = '';
    this.cdr.detectChanges();

    const payload: any = {
      organization: this.org,
      baseUrl: this.baseUrl
    };

    if (this.authType === 'pat') {
      payload.personalAccessToken = this.pat;
    } else {
      payload.username = this.username;
      payload.password = this.password;
    }

    this.devOpsService.connect(payload).subscribe({
      next: (res) => {
        this.isLoading = false;
        this.cdr.detectChanges();
        if (res.isConfigured) {
          this.successMessage = 'Successfully connected to Azure DevOps!';
          this.isConfigured = true;
          this.currentOrg = res.organization || this.org;
          this.cdr.detectChanges();
          setTimeout(() => {
            this.router.navigate(['/dashboard']);
          }, 1000);
        }
      },
      error: (err) => {
        this.isLoading = false;
        this.errorMessage = err.error?.message || 'Failed to verify connection. Please check your credentials or organization status.';
        this.cdr.detectChanges();
      }
    });
  }

  disconnect() {
    localStorage.removeItem('devops_config');
    this.isConfigured = false;
    this.org = this.currentOrg;
    this.pat = '';
    this.username = '';
    this.password = '';
    this.baseUrl = '';
    this.cdr.detectChanges();
  }
}
