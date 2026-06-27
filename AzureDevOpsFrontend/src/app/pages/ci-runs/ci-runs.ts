import { Component, inject, OnInit, ChangeDetectorRef } from '@angular/core';
import { DevOpsService } from '../../services/devops.service';
import { BuildRunModel } from '../../models/devops.models';
import { Sidebar } from '../../components/sidebar/sidebar';
import { NgIf, NgFor, DatePipe } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';

@Component({
  selector: 'app-ci-runs',
  standalone: true,
  imports: [Sidebar, NgIf, NgFor, DatePipe],
  templateUrl: './ci-runs.html',
  styleUrl: './ci-runs.css'
})
export class CiRuns implements OnInit {
  private readonly devOpsService = inject(DevOpsService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly cdr = inject(ChangeDetectorRef);
  protected readonly Math = Math;

  protected project = '';
  protected definitionId = 0;
  protected pipelineName = '';

  protected runs: BuildRunModel[] = [];
  protected paginatedRuns: BuildRunModel[] = [];

  protected isLoading = false;
  protected error = '';

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

    this.devOpsService.getCiPipelineRuns(this.project, this.definitionId).subscribe({
      next: (runs) => {
        this.runs = runs;
        this.isLoading = false;
        
        // Find pipeline name from the builds if available, otherwise format a fallback
        if (runs.length > 0) {
          // Typically we would pass this or extract it.
          this.pipelineName = this.project + " Build History";
        } else {
          this.pipelineName = `Pipeline #${this.definitionId}`;
        }
        
        this.currentPage = 1;
        this.updatePagination();
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.error = 'Failed to load run history for this pipeline. Please check your connection.';
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
    this.router.navigate(['/ci']);
  }
}
