import { Component, inject, OnInit, ChangeDetectorRef } from '@angular/core';
import { DevOpsService } from '../../services/devops.service';
import { ReleaseRunModel } from '../../models/devops.models';
import { Sidebar } from '../../components/sidebar/sidebar';
import { NgIf, NgFor, DatePipe } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';

@Component({
  selector: 'app-cd-runs',
  standalone: true,
  imports: [Sidebar, NgIf, NgFor, DatePipe],
  templateUrl: './cd-runs.html',
  styleUrl: './cd-runs.css'
})
export class CdRuns implements OnInit {
  // Helper to compute the displayed status for an environment
  getEnvDisplayStatus(env: any): string {
    const status = env?.status?.toLowerCase();
    const opStatus = env?.operationStatus?.toLowerCase();
    if (status === 'inprogress' && opStatus === 'pending') {
      return 'Pending';
    }
    return env?.status || '';
  }

  // Helper to decide whether approve/reject buttons should be shown
  canActOnEnv(env: any): boolean {
    const status = env?.status?.toLowerCase();
    const opStatus = env?.operationStatus?.toLowerCase();
    return status === 'pending' || status === 'pendingapproval' ||
      (status === 'inprogress' && opStatus === 'pending');
  }

  // Group environments by name category base (stripping trailing numbers/spaces, e.g. "Donates Admin 1" -> "Donates Admin" row)
  getGroupedEnvironments(environments: any[]): any[][] {
    if (!environments) return [];
    const groups: { [key: string]: any[] } = {};
    const order: string[] = [];
    
    environments.forEach(env => {
      // Strip trailing numbers, hyphens, underscores and spaces (e.g. "Donates Admin 1" -> "donates admin")
      const groupKey = env.name.replace(/[\s\-_]*\d+\s*$/, '').trim().toLowerCase();
      
      if (!groups[groupKey]) {
        groups[groupKey] = [];
        order.push(groupKey);
      }
      groups[groupKey].push(env);
    });
    
    return order.map(groupKey => groups[groupKey]);
  }
  private readonly devOpsService = inject(DevOpsService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly cdr = inject(ChangeDetectorRef);
  protected readonly Math = Math;

  protected project = '';
  protected definitionId = 0;
  protected pipelineName = '';

  protected runs: ReleaseRunModel[] = [];
  protected paginatedRuns: ReleaseRunModel[] = [];

  protected isLoading = false;
  protected error = '';
  protected expandedRuns: { [runId: number]: boolean } = {};

  toggleRunExpand(runId: number) {
    this.expandedRuns[runId] = !this.expandedRuns[runId];
    this.cdr.detectChanges();
  }

  // Pagination
  protected currentPage = 1;
  protected pageSize = 10;
  protected totalPages = 1;

  ngOnInit() {
    this.route.params.subscribe(params => {
      this.project = params['project'] || '';
      this.definitionId = Number(params['definitionId']) || 0;
      this.loadRuns();
    });
  }

  loadRuns() {
    this.isLoading = true;
    this.cdr.detectChanges();

    this.devOpsService.getCdPipelineRuns(this.project, this.definitionId).subscribe({
      next: (runs) => {
        this.runs = runs;
        console.log(this.runs)
        this.isLoading = false;

        if (runs.length > 0) {
          this.pipelineName = this.project + " Release History";
        } else {
          this.pipelineName = `Release Pipeline #${this.definitionId}`;
        }

        this.currentPage = 1;
        this.updatePagination();
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.error = 'Failed to load release history for this pipeline. Please check your connection.';
        this.isLoading = false;
        this.cdr.detectChanges();
      }
    });
  }

  updatePagination() {
    this.totalPages = Math.ceil(this.runs.length / this.pageSize) || 1;

    if (this.currentPage > this.totalPages) {
      this.currentPage = this.totalPages;
    }
    if (this.currentPage < 1) {
      this.currentPage = 1;
    }

    const startIndex = (this.currentPage - 1) * this.pageSize;
    this.paginatedRuns = this.runs.slice(startIndex, startIndex + this.pageSize);
    this.cdr.detectChanges();
  }

  goToPage(page: number) {
    if (page >= 1 && page <= this.totalPages) {
      this.currentPage = page;
      this.updatePagination();
    }
  }

  getPageNumbers(): number[] {
    const pages: number[] = [];
    for (let i = 1; i <= this.totalPages; i++) {
      pages.push(i);
    }
    return pages;
  }

  goBack() {
    this.router.navigate(['/cd']);
  }


  // Approve a pending release
  approveRelease(approvalId: number) {
    this.openConfirm(
      'Approve Release Stage',
      'Are you sure you want to Approve this release stage?',
      () => {
        this.devOpsService.approveRelease(this.project, approvalId).subscribe({
          next: () => {
            this.loadRuns();
          },
          error: (err) => {
            console.error('Approve failed', err);
          }
        });
      }
    );
  }

  // Reject a pending release
  rejectRelease(approvalId: number) {
    this.openConfirm(
      'Reject Release Stage',
      'Are you sure you want to Reject this release stage?',
      () => {
        this.devOpsService.rejectRelease(this.project, approvalId).subscribe({
          next: () => {
            this.loadRuns();
          },
          error: (err) => {
            console.error('Reject failed', err);
          }
        });
      }
    );
  }

  protected isTriggering = false;

  triggerRelease() {
    this.openConfirm(
      'Trigger Release Deployment',
      'Are you sure you want to trigger a new release deployment?',
      () => {
        this.isTriggering = true;
        this.cdr.detectChanges();

        this.devOpsService.triggerCdPipeline(this.project, this.definitionId).subscribe({
          next: () => {
            setTimeout(() => {
              this.loadRuns();
              this.isTriggering = false;
              this.cdr.detectChanges();
            }, 1500);
          },
          error: (err) => {
            if (err && err.status === 403) {
              alert('You do not have permission to run this CD pipeline.');
            } else {
              alert('Failed to trigger release for this pipeline.');
            }
            this.isTriggering = false;
            this.cdr.detectChanges();
          }
        });
      }
    );
  }

  canDeployEnv(env: any): boolean {
    const status = env?.status?.toLowerCase();
    const opStatus = env?.operationStatus?.toLowerCase();
    return status !== 'inprogress' && status !== 'pending' && status !== 'pendingapproval' && opStatus !== 'pending';
  }

  deployEnv(releaseId: number, envId: number, envName?: string) {
    const stageMsg = envName ? `stage "${envName}"` : 'this environment stage';
    this.openConfirm(
      'Deploy Stage',
      `Are you sure you want to deploy to ${stageMsg}?`,
      () => {
        this.devOpsService.deployReleaseEnvironment(this.project, releaseId, envId).subscribe({
          next: () => {
            setTimeout(() => {
              this.loadRuns();
            }, 1500);
          },
          error: (err) => {
            console.error('Deploy environment failed', err);
            alert('Failed to deploy release environment.');
          }
        });
      }
    );
  }

  // Custom Confirmation Modal Logic
  protected showConfirmModal = false;
  protected confirmTitle = '';
  protected confirmMessage = '';
  private confirmCallback: (() => void) | null = null;

  protected openConfirm(title: string, message: string, callback: () => void) {
    this.confirmTitle = title;
    this.confirmMessage = message;
    this.confirmCallback = callback;
    this.showConfirmModal = true;
    this.cdr.detectChanges();
  }

  protected executeConfirm() {
    if (this.confirmCallback) {
      this.confirmCallback();
    }
    this.closeConfirm();
  }

  protected closeConfirm() {
    this.showConfirmModal = false;
    this.confirmTitle = '';
    this.confirmMessage = '';
    this.confirmCallback = null;
    this.cdr.detectChanges();
  }
}
