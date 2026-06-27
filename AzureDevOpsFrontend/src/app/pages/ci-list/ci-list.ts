import { Component, inject, OnInit, ChangeDetectorRef } from '@angular/core';
import { DevOpsService } from '../../services/devops.service';
import { CiPipelineModel } from '../../models/devops.models';
import { Sidebar } from '../../components/sidebar/sidebar';
import { NgIf, NgFor, DatePipe, UpperCasePipe } from '@angular/common';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-ci-list',
  standalone: true,
  imports: [Sidebar, NgIf, NgFor, DatePipe, UpperCasePipe, FormsModule],
  templateUrl: './ci-list.html',
  styleUrl: './ci-list.css'
})
export class CiList implements OnInit {
  private readonly devOpsService = inject(DevOpsService);
  private readonly router = inject(Router);
  private readonly cdr = inject(ChangeDetectorRef);
  protected readonly Math = Math;

  protected pipelines: CiPipelineModel[] = [];
  protected filteredPipelines: CiPipelineModel[] = [];
  protected paginatedPipelines: CiPipelineModel[] = [];
  
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

  // Branch selector modal state
  protected showBranchModal = false;
  protected selectedPipelineForTrigger: CiPipelineModel | null = null;
  protected branches: string[] = [];
  protected filteredBranchesList: string[] = [];
  protected selectedBranchForTrigger = '';
  protected branchSearchQuery = '';
  protected isLoadingBranches = false;
  protected branchError = '';

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
    this.isLoading = true;
    this.cdr.detectChanges();
    this.devOpsService.getCiPipelines().subscribe({
      next: (pipelines) => {
        this.pipelines = pipelines;
        this.projectsList = Array.from(new Set(pipelines.map(p => p.projectName))).sort();
        this.filterPipelines();
        this.isLoading = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.error = 'Failed to load CI pipelines. Please check your credentials or organization status.';
        this.isLoading = false;
        this.cdr.detectChanges();
      }
    });
  }

  filterPipelines() {
    const searchLower = this.searchQuery.toLowerCase().trim();
    
    // Filter definitions
    this.filteredPipelines = this.pipelines.filter(p => {
      const matchesSearch = !searchLower || p.name.toLowerCase().includes(searchLower) || p.projectName.toLowerCase().includes(searchLower);
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

  openBranchSelector(pipeline: CiPipelineModel) {
    this.selectedPipelineForTrigger = pipeline;
    this.showBranchModal = true;
    this.isLoadingBranches = true;
    this.branches = [];
    this.filteredBranchesList = [];
    this.selectedBranchForTrigger = '';
    this.branchSearchQuery = '';
    this.branchError = '';
    this.cdr.detectChanges();

    this.devOpsService.getPipelineBranches(pipeline.projectName, pipeline.definitionId).subscribe({
      next: (branches) => {
        this.branches = branches || [];
        this.filteredBranchesList = [...this.branches];
        const masterBranch = this.branches.find(b => b === 'refs/heads/master' || b === 'refs/heads/main');
        this.selectedBranchForTrigger = masterBranch || this.branches[0] || 'refs/heads/master';
        this.isLoadingBranches = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.branchError = 'Failed to fetch branches. Falling back to default refs/heads/master.';
        this.branches = ['refs/heads/master'];
        this.filteredBranchesList = [...this.branches];
        this.selectedBranchForTrigger = 'refs/heads/master';
        this.isLoadingBranches = false;
        this.cdr.detectChanges();
      }
    });
  }

  filterBranches() {
    const query = this.branchSearchQuery.toLowerCase().trim();
    if (!query) {
      this.filteredBranchesList = [...this.branches];
    } else {
      this.filteredBranchesList = this.branches.filter(b => 
        b.toLowerCase().includes(query) || this.getCleanBranchName(b).toLowerCase().includes(query)
      );
    }
    
    if (this.filteredBranchesList.length > 0 && !this.filteredBranchesList.includes(this.selectedBranchForTrigger)) {
      this.selectedBranchForTrigger = this.filteredBranchesList[0];
    }
  }

  closeBranchModal() {
    this.showBranchModal = false;
    this.selectedPipelineForTrigger = null;
    this.branches = [];
    this.filteredBranchesList = [];
    this.selectedBranchForTrigger = '';
    this.branchSearchQuery = '';
    this.branchError = '';
    this.cdr.detectChanges();
  }

  confirmTriggerPipeline() {
    if (!this.selectedPipelineForTrigger) return;
    
    const pipeline = this.selectedPipelineForTrigger;
    const id = pipeline.definitionId;
    const branch = this.selectedBranchForTrigger;
    
    this.openConfirm(
      'Confirm Build Run',
      `Are you sure you want to trigger build for pipeline "${pipeline.name}" on branch "${this.getCleanBranchName(branch)}"?`,
      () => {
        this.closeBranchModal();
        this.triggeringIds[id] = true;
        this.cdr.detectChanges();

        this.devOpsService.triggerCiPipeline(pipeline.projectName, id, branch).subscribe({
          next: () => {
            setTimeout(() => {
              this.devOpsService.getCiPipelines().subscribe({
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
              alert('You do not have permission to run this CI pipeline.');
            } else {
              alert(`Failed to queue build for pipeline: ${pipeline.name}`);
            }
            this.triggeringIds[id] = false;
            this.cdr.detectChanges();
          }
        });
      }
    );
  }

  protected getCleanBranchName(branch: string): string {
    if (!branch) return '';
    if (branch.startsWith('refs/heads/')) {
      return branch.substring(11);
    }
    if (branch.startsWith('refs/')) {
      return branch.substring(5);
    }
    return branch;
  }

  viewHistory(pipeline: CiPipelineModel) {
    this.router.navigate(['/ci/runs', pipeline.projectName, pipeline.definitionId]);
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
