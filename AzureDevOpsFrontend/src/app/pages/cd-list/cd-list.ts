import { Component, inject, OnInit, ChangeDetectorRef } from '@angular/core';
import { ReplaceBackslashPipe } from '../../pipes/replace-backslash.pipe';
import { DevOpsService } from '../../services/devops.service';
import { CdPipelineModel } from '../../models/devops.models';
import { Sidebar } from '../../components/sidebar/sidebar';
import { NgIf, NgFor, DatePipe, UpperCasePipe } from '@angular/common';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-cd-list',
  standalone: true,
  imports: [Sidebar, NgIf, NgFor, DatePipe, UpperCasePipe, FormsModule, ReplaceBackslashPipe],
  templateUrl: './cd-list.html',
  styleUrl: './cd-list.css'
})
export class CdList implements OnInit {
  private readonly devOpsService = inject(DevOpsService);
  private readonly router = inject(Router);
  private readonly cdr = inject(ChangeDetectorRef);
  protected readonly Math = Math;

  protected pipelines: CdPipelineModel[] = [];
  protected filteredPipelines: CdPipelineModel[] = [];
  protected paginatedPipelines: CdPipelineModel[] = [];

  protected searchQuery = '';
  protected selectedProject = '';
  protected projectsList: string[] = [];

  protected isLoading = false;
  protected error = '';

  // Pagination
  protected currentPage = 1;
  protected pageSize = 10;
  protected totalPages = 1;

  // Track trigger status for definition ID
  protected triggeringIds: { [id: number]: boolean } = {};

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
        this.loadPipelines();
      },
      error: () => {
        this.router.navigate(['/connect']);
      }
    });
  }

  loadPipelines() {
    debugger;
    this.isLoading = true;
    this.cdr.detectChanges();
    this.devOpsService.getCdPipelines().subscribe({
      next: (pipelines) => {
        this.pipelines = pipelines;
        this.isLoading = false;
        this.projectsList = Array.from(new Set(pipelines.map(p => p.projectName))).sort();
        console.log(this.projectsList)
        this.filterPipelines();
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.error = 'Failed to load CD pipelines. Please check your credentials or organization status.';
        this.isLoading = false;
        this.cdr.detectChanges();
      }
    });
  }

  filterPipelines() {
    const searchLower = this.searchQuery.toLowerCase().trim();

    // Filter definitions
    this.filteredPipelines = this.pipelines.filter(p => {
      const matchesSearch = !searchLower || p.name.toLowerCase().includes(searchLower) || (p.description && p.description.toLowerCase().includes(searchLower)) || p.projectName.toLowerCase().includes(searchLower);
      const matchesProject = !this.selectedProject || p.projectName === this.selectedProject;
      return matchesSearch && matchesProject;
    });

    // Sort by Project, then Pipeline Name
    this.filteredPipelines.sort((a, b) => {
      const projCompare = a.projectName.localeCompare(b.projectName);
      if (projCompare !== 0) return projCompare;
      return a.name.localeCompare(b.name);
    });

    this.currentPage = 1;
    this.updatePagination();
  }

  updatePagination() {
    this.totalPages = Math.ceil(this.filteredPipelines.length / this.pageSize) || 1;

    if (this.currentPage > this.totalPages) {
      this.currentPage = this.totalPages;
    }
    if (this.currentPage < 1) {
      this.currentPage = 1;
    }

    const startIndex = (this.currentPage - 1) * this.pageSize;
    this.paginatedPipelines = this.filteredPipelines.slice(startIndex, startIndex + this.pageSize);
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

  onFilterChange() {
    this.filterPipelines();
  }

  triggerRelease(pipeline: CdPipelineModel) {
    const id = pipeline.definitionId;
    this.openConfirm(
      'Confirm Deployment',
      `Are you sure you want to trigger a new release deployment for pipeline "${pipeline.name}"?`,
      () => {
        this.triggeringIds[id] = true;
        this.cdr.detectChanges();

        this.devOpsService.triggerCdPipeline(pipeline.projectName, id).subscribe({
          next: () => {
            setTimeout(() => {
              this.devOpsService.getCdPipelines().subscribe({
                next: (newPipelines) => {
                  this.pipelines = newPipelines;
                  this.filterPipelines();
                  this.triggeringIds[id] = false;
                  this.cdr.detectChanges();
                },
                error: () => {
                  this.triggeringIds[id] = false;
                  this.cdr.detectChanges();
                }
              });
            }, 1500);
          },
          error: (err) => {
            if (err && err.status === 403) {
              alert('You do not have permission to run this CD pipeline.');
            } else {
              alert(`Failed to trigger release for pipeline: ${pipeline.name}`);
            }
            this.triggeringIds[id] = false;
            this.cdr.detectChanges();
          }
        });
      }
    );
  }

  viewHistory(pipeline: CdPipelineModel) {
    this.router.navigate(['/cd/runs', pipeline.projectName, pipeline.definitionId]);
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
