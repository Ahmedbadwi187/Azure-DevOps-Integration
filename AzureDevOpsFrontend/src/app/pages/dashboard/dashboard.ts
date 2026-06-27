import { Component, inject, OnInit, ChangeDetectorRef } from '@angular/core';
import { DevOpsService } from '../../services/devops.service';
import { ProjectModel } from '../../models/devops.models';
import { Sidebar } from '../../components/sidebar/sidebar';
import { NgIf, NgFor, UpperCasePipe } from '@angular/common';
import { Router } from '@angular/router';
import { Chart, registerables } from 'chart.js';

Chart.register(...registerables);

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [Sidebar, NgIf, NgFor, UpperCasePipe],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css'
})
export class Dashboard implements OnInit {
  private readonly devOpsService = inject(DevOpsService);
  private readonly router = inject(Router);
  private readonly cdr = inject(ChangeDetectorRef);

  protected projects: ProjectModel[] = [];
  
  protected totalProjects = 0;
  protected totalCiPipelines = 0;
  protected totalCdPipelines = 0;
  protected organizationName = '';

  protected isLoading = false;
  protected loadingCi = false;
  protected loadingCd = false;
  protected error = '';

  private ciChart: Chart | null = null;
  private cdChart: Chart | null = null;
  private ciProjectChart: Chart | null = null;
  private cdProjectChart: Chart | null = null;

  ngOnInit() {
    this.checkConnectionAndLoad();
  }

  checkConnectionAndLoad() {
    this.isLoading = true;
    this.cdr.detectChanges();
    this.devOpsService.getConnectionStatus().subscribe({
      next: (status) => {
        if (!status.isConfigured) {
          this.router.navigate(['/connect']);
          return;
        }
        this.organizationName = status.organization || '';
        this.cdr.detectChanges();
        this.loadDashboardData();
      },
      error: () => {
        this.router.navigate(['/connect']);
      }
    });
  }

  loadDashboardData() {
    this.devOpsService.getProjects().subscribe({
      next: (projects) => {
        this.projects = projects;
        this.totalProjects = projects.length;
        this.isLoading = false; // Stop main loading once projects list is available
        this.cdr.detectChanges();
        
        // Fetch CI pipelines in background
        this.loadingCi = true;
        this.cdr.detectChanges();
        this.devOpsService.getCiPipelines().subscribe({
          next: (ci) => {
            this.totalCiPipelines = ci.length;
            this.loadingCi = false;
            
            // Calculate overall status counts
            let succeeded = 0;
            let failed = 0;
            let inProgress = 0;
            let other = 0;

            // Group CI by project name
            const projectStatsMap: { [projectName: string]: { succeeded: number; failed: number; inProgress: number; other: number } } = {};
            
            // Initialize maps for all projects to guarantee they appear on chart
            this.projects.forEach(p => {
              projectStatsMap[p.name] = { succeeded: 0, failed: 0, inProgress: 0, other: 0 };
            });

            ci.forEach(pipeline => {
              const projName = pipeline.projectName || 'Default';
              if (!projectStatsMap[projName]) {
                projectStatsMap[projName] = { succeeded: 0, failed: 0, inProgress: 0, other: 0 };
              }
              if (pipeline.latestRun) {
                const res = pipeline.latestRun.result?.toLowerCase();
                const status = pipeline.latestRun.status?.toLowerCase();
                if (res === 'succeeded') {
                  succeeded++;
                  projectStatsMap[projName].succeeded++;
                } else if (res === 'failed') {
                  failed++;
                  projectStatsMap[projName].failed++;
                } else if (status === 'inprogress' || status === 'running') {
                  inProgress++;
                  projectStatsMap[projName].inProgress++;
                } else {
                  other++;
                  projectStatsMap[projName].other++;
                }
              } else {
                other++;
                projectStatsMap[projName].other++;
              }
            });

            this.cdr.detectChanges();
            this.createCiChart(succeeded, failed, inProgress, other);
            this.createCiProjectChart(projectStatsMap);
          },
          error: () => {
            this.loadingCi = false;
            this.cdr.detectChanges();
          }
        });

        // Fetch CD pipelines in background
        this.loadingCd = true;
        this.cdr.detectChanges();
        this.devOpsService.getCdPipelines().subscribe({
          next: (cd) => {
            this.totalCdPipelines = cd.length;
            this.loadingCd = false;
            
            // Calculate overall status counts
            let succeeded = 0;
            let rejected = 0;
            let failed = 0;
            let inProgress = 0;
            let pending = 0;
            let notStarted = 0;

            // Group CD by project name
            const projectCdStatsMap: { [projectName: string]: { succeeded: number; rejected: number; failed: number; inProgress: number; pending: number; notStarted: number } } = {};

            // Initialize maps for all projects
            this.projects.forEach(p => {
              projectCdStatsMap[p.name] = { succeeded: 0, rejected: 0, failed: 0, inProgress: 0, pending: 0, notStarted: 0 };
            });

            cd.forEach(pipeline => {
              const projName = pipeline.projectName || 'Default';
              if (!projectCdStatsMap[projName]) {
                projectCdStatsMap[projName] = { succeeded: 0, rejected: 0, failed: 0, inProgress: 0, pending: 0, notStarted: 0 };
              }
              if (pipeline.latestRelease && pipeline.latestRelease.environments) {
                pipeline.latestRelease.environments.forEach(env => {
                  const status = env.status?.toLowerCase();
                  const opStatus = env.operationStatus?.toLowerCase();
                  if (status === 'succeeded') {
                    succeeded++;
                    projectCdStatsMap[projName].succeeded++;
                  } else if (status === 'rejected') {
                    rejected++;
                    projectCdStatsMap[projName].rejected++;
                  } else if (status === 'failed') {
                    failed++;
                    projectCdStatsMap[projName].failed++;
                  } else if (status === 'inprogress' && opStatus === 'pending') {
                    pending++;
                    projectCdStatsMap[projName].pending++;
                  } else if (status === 'inprogress' || status === 'running') {
                    inProgress++;
                    projectCdStatsMap[projName].inProgress++;
                  } else if (status === 'pending' || status === 'pendingapproval') {
                    pending++;
                    projectCdStatsMap[projName].pending++;
                  } else if (status === 'notstarted' || status === 'notdeployed') {
                    notStarted++;
                    projectCdStatsMap[projName].notStarted++;
                  } else {
                    notStarted++;
                    projectCdStatsMap[projName].notStarted++;
                  }
                });
              }
            });

            this.cdr.detectChanges();
            this.createCdChart(succeeded, rejected, failed, inProgress, pending, notStarted);
            this.createCdProjectChart(projectCdStatsMap);
          },
          error: () => {
            this.loadingCd = false;
            this.cdr.detectChanges();
          }
        });
      },
      error: (err) => {
        this.error = 'Failed to load projects. Please verify your connection details.';
        this.isLoading = false;
        this.cdr.detectChanges();
      }
    });
  }

  createCiChart(succeeded: number, failed: number, inProgress: number, other: number) {
    const ctx = document.getElementById('ciChart') as HTMLCanvasElement;
    if (!ctx) return;

    if (this.ciChart) {
      this.ciChart.destroy();
    }

    this.ciChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: ['Succeeded', 'Failed', 'In Progress', 'Other'],
        datasets: [{
          label: 'Runs Count',
          data: [succeeded, failed, inProgress, other],
          backgroundColor: [
            'rgba(16, 185, 129, 0.7)', // green
            'rgba(244, 63, 94, 0.7)',  // red
            'rgba(59, 130, 246, 0.7)',  // blue
            'rgba(255, 255, 255, 0.15)' // grey
          ],
          borderColor: [
            '#10b981',
            '#f43f5e',
            '#3b82f6',
            'rgba(255, 255, 255, 0.3)'
          ],
          borderWidth: 1,
          borderRadius: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: false
          }
        },
        scales: {
          x: {
            grid: {
              display: false
            },
            ticks: {
              color: '#9ca3af',
              font: {
                family: 'Plus Jakarta Sans',
                size: 10
              }
            }
          },
          y: {
            grid: {
              color: 'rgba(255, 255, 255, 0.05)'
            },
            ticks: {
              color: '#9ca3af',
              font: {
                family: 'Plus Jakarta Sans',
                size: 10
              },
              precision: 0
            }
          }
        }
      }
    });
  }

  createCiProjectChart(projectStatsMap: { [name: string]: { succeeded: number; failed: number; inProgress: number; other: number } }) {
    const ctx = document.getElementById('ciProjectChart') as HTMLCanvasElement;
    if (!ctx) return;

    if (this.ciProjectChart) {
      this.ciProjectChart.destroy();
    }

    const projectNames = Object.keys(projectStatsMap);
    const succeededData = projectNames.map(p => projectStatsMap[p].succeeded);
    const failedData = projectNames.map(p => projectStatsMap[p].failed);
    const inProgressData = projectNames.map(p => projectStatsMap[p].inProgress);
    const otherData = projectNames.map(p => projectStatsMap[p].other);

    this.ciProjectChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: projectNames,
        datasets: [
          {
            label: 'Succeeded',
            data: succeededData,
            backgroundColor: '#10b981',
            borderRadius: 4
          },
          {
            label: 'Failed',
            data: failedData,
            backgroundColor: '#f43f5e',
            borderRadius: 4
          },
          {
            label: 'In Progress',
            data: inProgressData,
            backgroundColor: '#3b82f6',
            borderRadius: 4
          },
          {
            label: 'Other',
            data: otherData,
            backgroundColor: '#6b7280',
            borderRadius: 4
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              color: '#9ca3af',
              font: { family: 'Plus Jakarta Sans', size: 10 }
            }
          }
        },
        scales: {
          x: {
            stacked: true,
            grid: { display: false },
            ticks: { color: '#9ca3af', font: { family: 'Plus Jakarta Sans', size: 10 } }
          },
          y: {
            stacked: true,
            grid: { color: 'rgba(255, 255, 255, 0.05)' },
            ticks: { color: '#9ca3af', font: { family: 'Plus Jakarta Sans', size: 10 }, precision: 0 }
          }
        }
      }
    });
  }

  createCdChart(succeeded: number, rejected: number, failed: number, inProgress: number, pending: number, notStarted: number) {
    const ctx = document.getElementById('cdChart') as HTMLCanvasElement;
    if (!ctx) return;

    if (this.cdChart) {
      this.cdChart.destroy();
    }

    this.cdChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: ['Succeeded', 'Rejected', 'Failed', 'In Progress', 'Pending', 'Not Started'],
        datasets: [{
          label: 'Stages Count',
          data: [succeeded, rejected, failed, inProgress, pending, notStarted],
          backgroundColor: [
            'rgba(16, 185, 129, 0.7)', // green
            'rgba(244, 63, 94, 0.7)',  // red
            'rgba(239, 68, 68, 0.7)',   // failed red
            'rgba(59, 130, 246, 0.7)',  // blue
            'rgba(245, 158, 11, 0.7)',  // amber
            'rgba(255, 255, 255, 0.15)' // grey
          ],
          borderColor: [
            '#10b981',
            '#f43f5e',
            '#ef4444',
            '#3b82f6',
            '#f59e0b',
            'rgba(255, 255, 255, 0.3)'
          ],
          borderWidth: 1,
          borderRadius: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: false
          }
        },
        scales: {
          x: {
            grid: {
              display: false
            },
            ticks: {
              color: '#9ca3af',
              font: {
                family: 'Plus Jakarta Sans',
                size: 10
              }
            }
          },
          y: {
            grid: {
              color: 'rgba(255, 255, 255, 0.05)'
            },
            ticks: {
              color: '#9ca3af',
              font: {
                family: 'Plus Jakarta Sans',
                size: 10
              },
              precision: 0
            }
          }
        }
      }
    });
  }

  createCdProjectChart(projectCdStatsMap: { [name: string]: { succeeded: number; rejected: number; failed: number; inProgress: number; pending: number; notStarted: number } }) {
    const ctx = document.getElementById('cdProjectChart') as HTMLCanvasElement;
    if (!ctx) return;

    if (this.cdProjectChart) {
      this.cdProjectChart.destroy();
    }

    const cdProjectNames = Object.keys(projectCdStatsMap);
    const cdSucceededData = cdProjectNames.map(p => projectCdStatsMap[p].succeeded);
    const cdRejectedData = cdProjectNames.map(p => projectCdStatsMap[p].rejected);
    const cdFailedData = cdProjectNames.map(p => projectCdStatsMap[p].failed);
    const cdInProgressData = cdProjectNames.map(p => projectCdStatsMap[p].inProgress);
    const cdPendingData = cdProjectNames.map(p => projectCdStatsMap[p].pending);
    const cdNotStartedData = cdProjectNames.map(p => projectCdStatsMap[p].notStarted);

    this.cdProjectChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: cdProjectNames,
        datasets: [
          {
            label: 'Succeeded',
            data: cdSucceededData,
            backgroundColor: 'rgba(16, 185, 129, 0.7)',
            borderColor: '#10b981',
            borderWidth: 1,
            borderRadius: 4
          },
          {
            label: 'Rejected',
            data: cdRejectedData,
            backgroundColor: 'rgba(244, 63, 94, 0.7)',
            borderColor: '#f43f5e',
            borderWidth: 1,
            borderRadius: 4
          },
          {
            label: 'Failed',
            data: cdFailedData,
            backgroundColor: 'rgba(239, 68, 68, 0.7)',
            borderColor: '#ef4444',
            borderWidth: 1,
            borderRadius: 4
          },
          {
            label: 'In Progress',
            data: cdInProgressData,
            backgroundColor: 'rgba(59, 130, 246, 0.7)',
            borderColor: '#3b82f6',
            borderWidth: 1,
            borderRadius: 4
          },
          {
            label: 'Pending',
            data: cdPendingData,
            backgroundColor: 'rgba(245, 158, 11, 0.7)',
            borderColor: '#f59e0b',
            borderWidth: 1,
            borderRadius: 4
          },
          {
            label: 'Not Started',
            data: cdNotStartedData,
            backgroundColor: 'rgba(255, 255, 255, 0.15)',
            borderColor: 'rgba(255, 255, 255, 0.3)',
            borderWidth: 1,
            borderRadius: 4
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              color: '#9ca3af',
              font: { family: 'Plus Jakarta Sans', size: 10 }
            }
          }
        },
        scales: {
          x: {
            stacked: true,
            grid: { display: false },
            ticks: { color: '#9ca3af', font: { family: 'Plus Jakarta Sans', size: 10 } }
          },
          y: {
            stacked: true,
            grid: { color: 'rgba(255, 255, 255, 0.05)' },
            ticks: { color: '#9ca3af', font: { family: 'Plus Jakarta Sans', size: 10 }, precision: 0 }
          }
        }
      }
    });
  }
}
