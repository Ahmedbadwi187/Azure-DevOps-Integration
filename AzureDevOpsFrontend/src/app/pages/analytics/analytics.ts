import { Component, inject, OnInit, OnDestroy, ChangeDetectorRef, AfterViewChecked } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Sidebar } from '../../components/sidebar/sidebar';
import { DevOpsService } from '../../services/devops.service';
import { Chart } from 'chart.js/auto';

@Component({
  selector: 'app-analytics',
  standalone: true,
  imports: [CommonModule, Sidebar],
  templateUrl: './analytics.html',
  styleUrl: './analytics.css'
})
export class Analytics implements OnInit, OnDestroy, AfterViewChecked {
  private readonly devOpsService = inject(DevOpsService);
  private readonly cdr = inject(ChangeDetectorRef);

  protected summary: any = null;
  protected trends: any[] = [];
  protected pipelines: any[] = [];

  protected timeframe = 2; // default 2 days
  protected isLoading = false;
  protected error = '';

  private successRateChart: Chart | null = null;
  private deploymentChart: Chart | null = null;
  private durationChart: Chart | null = null;
  private mttrChart: Chart | null = null;
  
  private pendingChartUpdate = false;

  ngOnInit() {
    this.loadAnalytics();
  }

  ngOnDestroy() {
    this.destroyCharts();
  }

  ngAfterViewChecked() {
    if (this.pendingChartUpdate) {
      this.pendingChartUpdate = false;
      this.initCharts();
    }
  }

  loadAnalytics() {
    this.isLoading = true;
    this.error = '';
    this.destroyCharts();
    this.cdr.detectChanges();

    this.devOpsService.getAnalytics(this.timeframe).subscribe({
      next: (data) => {
        this.summary = data.summary;
        this.trends = data.trends;
        this.pipelines = data.pipelines;
        this.isLoading = false;
        this.pendingChartUpdate = true;
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Failed to load analytics', err);
        this.error = 'Failed to load analytics metrics from backend service.';
        this.isLoading = false;
        this.cdr.detectChanges();
      }
    });
  }

  changeTimeframe(days: number) {
    this.timeframe = days;
    this.loadAnalytics();
  }

  private destroyCharts() {
    if (this.successRateChart) {
      this.successRateChart.destroy();
      this.successRateChart = null;
    }
    if (this.deploymentChart) {
      this.deploymentChart.destroy();
      this.deploymentChart = null;
    }
    if (this.durationChart) {
      this.durationChart.destroy();
      this.durationChart = null;
    }
    if (this.mttrChart) {
      this.mttrChart.destroy();
      this.mttrChart = null;
    }
  }

  private initCharts() {
    if (!this.trends || this.trends.length === 0) return;

    const labels = this.trends.map(t => this.formatDate(t.date));
    const successRates = this.trends.map(t => t.successRate);
    const deployments = this.trends.map(t => t.deploymentsCount);
    const durations = this.trends.map(t => Math.round(t.averageDurationSeconds / 60)); // to minutes
    const mttrs = this.trends.map(t => Math.round((t.mttrSeconds / 3600) * 10) / 10); // to hours (1 decimal place)

    this.destroyCharts();

    // 1. Success Rate Chart
    const ctxSuccess = document.getElementById('successRateChart') as HTMLCanvasElement;
    if (ctxSuccess) {
      this.successRateChart = new Chart(ctxSuccess, {
        type: 'line',
        data: {
          labels,
          datasets: [{
            label: 'Success Rate (%)',
            data: successRates,
            borderColor: '#10b981', // Emerald green
            backgroundColor: 'rgba(16, 185, 129, 0.08)',
            fill: true,
            tension: 0.35,
            borderWidth: 2.5,
            pointRadius: labels.length > 30 ? 0 : 3,
            pointHoverRadius: 6
          }]
        },
        options: this.getChartOptions('Success Rate (%)', 100)
      });
    }

    // 2. Deployments Chart
    const ctxDeploy = document.getElementById('deploymentChart') as HTMLCanvasElement;
    if (ctxDeploy) {
      this.deploymentChart = new Chart(ctxDeploy, {
        type: 'bar',
        data: {
          labels,
          datasets: [{
            label: 'Deployments',
            data: deployments,
            backgroundColor: 'rgba(59, 130, 246, 0.75)', // Blue
            borderColor: '#3b82f6',
            borderWidth: 1,
            borderRadius: 4
          }]
        },
        options: this.getChartOptions('Deployments')
      });
    }

    // 3. Duration Chart
    const ctxDuration = document.getElementById('durationChart') as HTMLCanvasElement;
    if (ctxDuration) {
      this.durationChart = new Chart(ctxDuration, {
        type: 'line',
        data: {
          labels,
          datasets: [{
            label: 'Duration (min)',
            data: durations,
            borderColor: '#a855f7', // Purple
            backgroundColor: 'rgba(168, 85, 247, 0.08)',
            fill: true,
            tension: 0.35,
            borderWidth: 2.5,
            pointRadius: labels.length > 30 ? 0 : 3,
            pointHoverRadius: 6
          }]
        },
        options: this.getChartOptions('Duration (min)')
      });
    }

    // 4. MTTR Chart
    const ctxMttr = document.getElementById('mttrChart') as HTMLCanvasElement;
    if (ctxMttr) {
      this.mttrChart = new Chart(ctxMttr, {
        type: 'bar',
        data: {
          labels,
          datasets: [{
            label: 'MTTR (hours)',
            data: mttrs,
            backgroundColor: 'rgba(239, 68, 68, 0.75)', // Red
            borderColor: '#ef4444',
            borderWidth: 1,
            borderRadius: 4
          }]
        },
        options: this.getChartOptions('MTTR (hours)')
      });
    }
    
    this.cdr.detectChanges();
  }

  private getChartOptions(yLabel: string, maxVal?: number): any {
    return {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          mode: 'index',
          intersect: false,
          backgroundColor: 'rgba(15, 23, 42, 0.95)',
          titleColor: '#9ca3af',
          bodyColor: '#f3f4f6',
          borderColor: 'rgba(255, 255, 255, 0.08)',
          borderWidth: 1,
          padding: 10,
          cornerRadius: 6
        }
      },
      scales: {
        x: {
          grid: {
            color: 'rgba(255, 255, 255, 0.04)',
            drawTicks: false
          },
          ticks: {
            color: '#9ca3af',
            maxRotation: 45,
            minRotation: 0,
            font: {
              family: "'Inter', sans-serif",
              size: 9
            }
          }
        },
        y: {
          grid: {
            color: 'rgba(255, 255, 255, 0.04)',
            drawTicks: false
          },
          suggestedMax: maxVal,
          ticks: {
            color: '#9ca3af',
            font: {
              family: "'Inter', sans-serif",
              size: 9
            }
          }
        }
      }
    };
  }

  protected formatDate(dateStr: string): string {
    if (!dateStr) return '';
    try {
      const date = new Date(dateStr);
      // Format as "Mon DD" e.g., "Jun 24"
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    } catch {
      return dateStr;
    }
  }

  protected formatDuration(seconds: number): string {
    if (!seconds || isNaN(seconds)) return '0s';
    if (seconds < 60) return `${Math.round(seconds)}s`;
    const mins = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
  }

  protected formatMttr(seconds: number): string {
    if (!seconds || isNaN(seconds) || seconds === 0) return '0 mins';
    if (seconds < 60) return '1 min';
    const mins = Math.floor(seconds / 60);
    if (mins < 60) return `${mins} mins`;
    const hrs = Math.floor(mins / 60);
    const remainingMins = mins % 60;
    return remainingMins > 0 ? `${hrs}h ${remainingMins}m` : `${hrs}h`;
  }
}
