/**
 * PDF Report Generation Service
 * 
 * Professional PDF generation for financial reports with consistent branding,
 * charts, tables, and proper formatting for print and digital distribution.
 */

import PDFDocument from 'pdfkit';
import { Readable } from 'stream';
import { formatCentsToDollars } from '../../royalties/utils/financial.utils';

export interface PDFReportConfig {
  title: string;
  subtitle?: string;
  reportType: string;
  generatedAt: Date;
  generatedBy: string;
  period?: {
    startDate: Date;
    endDate: Date;
  };
  branding?: {
    companyName: string;
    logo?: Buffer;
    primaryColor: string;
    secondaryColor: string;
  };
}

export interface TableConfig {
  headers: string[];
  rows: (string | number)[][];
  columnWidths?: number[];
  alignment?: ('left' | 'center' | 'right')[];
  formatting?: {
    currency?: number[]; // Column indices to format as currency
    percentage?: number[]; // Column indices to format as percentage
  };
}

export interface ChartConfig {
  type: 'line' | 'bar' | 'pie';
  title: string;
  data: {
    labels: string[];
    values: number[];
  };
  width?: number;
  height?: number;
}

export class PDFReportGenerationService {
  private doc!: InstanceType<typeof PDFDocument>;
  private currentY: number = 0;
  private pageWidth: number = 612; // US Letter width in points
  private pageHeight: number = 792; // US Letter height in points
  private margins = { top: 72, bottom: 72, left: 72, right: 72 }; // 1 inch margins
  private contentWidth: number;

  constructor() {
    this.contentWidth = this.pageWidth - this.margins.left - this.margins.right;
  }

  /**
   * Generate PDF report and return as buffer
   */
  async generateReport(
    config: PDFReportConfig,
    content: {
      sections: PDFSection[];
    }
  ): Promise<Buffer> {
    this.doc = new PDFDocument({
      size: 'LETTER',
      margins: this.margins,
      info: {
        Title: config.title,
        Author: config.branding?.companyName || 'YesGoddess Platform',
        Subject: `${config.reportType} - ${config.period ? this.formatDateRange(config.period) : 'Generated Report'}`,
        Creator: 'YesGoddess Financial Analytics',
        Producer: 'YesGoddess Platform',
      },
    });

    this.currentY = this.margins.top;

    // Generate cover page
    await this.generateCoverPage(config);

    // Add table of contents if multiple sections
    if (content.sections.length > 1) {
      this.addNewPage();
      this.generateTableOfContents(content.sections);
    }

    // Generate content sections
    for (const section of content.sections) {
      this.addNewPage();
      await this.generateSection(section);
    }

    // Add footer to all pages
    this.addPageNumbers();

    // Convert to buffer
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      this.doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      this.doc.on('end', () => resolve(Buffer.concat(chunks)));
      this.doc.on('error', reject);
      this.doc.end();
    });
  }

  /**
   * Generate cover page
   */
  private async generateCoverPage(config: PDFReportConfig): Promise<void> {
    // Company logo if provided
    if (config.branding?.logo) {
      try {
        this.doc.image(config.branding.logo, this.margins.left, this.currentY, {
          width: 150,
        });
        this.currentY += 80;
      } catch (error) {
        // Skip logo if there's an error
        console.warn('Could not add logo to PDF:', error);
      }
    }

    // Main title
    this.doc
      .fontSize(28)
      .fillColor(config.branding?.primaryColor || '#1a365d')
      .text(config.title, this.margins.left, this.currentY, {
        width: this.contentWidth,
        align: 'center',
      });
    this.currentY += 50;

    // Subtitle if provided
    if (config.subtitle) {
      this.doc
        .fontSize(18)
        .fillColor('#4a5568')
        .text(config.subtitle, this.margins.left, this.currentY, {
          width: this.contentWidth,
          align: 'center',
        });
      this.currentY += 40;
    }

    // Report type
    this.doc
      .fontSize(16)
      .fillColor('#718096')
      .text(config.reportType, this.margins.left, this.currentY, {
        width: this.contentWidth,
        align: 'center',
      });
    this.currentY += 60;

    // Period information
    if (config.period) {
      this.doc
        .fontSize(14)
        .fillColor('#2d3748')
        .text(
          `Report Period: ${this.formatDateRange(config.period)}`,
          this.margins.left,
          this.currentY,
          {
            width: this.contentWidth,
            align: 'center',
          }
        );
      this.currentY += 30;
    }

    // Generation info
    this.doc
      .fontSize(12)
      .fillColor('#718096')
      .text(
        `Generated on ${config.generatedAt.toLocaleDateString()} at ${config.generatedAt.toLocaleTimeString()}`,
        this.margins.left,
        this.currentY,
        {
          width: this.contentWidth,
          align: 'center',
        }
      );
    this.currentY += 20;

    this.doc.text(`Generated by ${config.generatedBy}`, this.margins.left, this.currentY, {
      width: this.contentWidth,
      align: 'center',
    });

    // Decorative line
    this.currentY += 60;
    this.doc
      .strokeColor(config.branding?.primaryColor || '#1a365d')
      .lineWidth(2)
      .moveTo(this.margins.left + 100, this.currentY)
      .lineTo(this.margins.left + this.contentWidth - 100, this.currentY)
      .stroke();
  }

  /**
   * Generate table of contents
   */
  private generateTableOfContents(sections: PDFSection[]): void {
    this.doc
      .fontSize(20)
      .fillColor('#1a365d')
      .text('Table of Contents', this.margins.left, this.currentY);
    this.currentY += 40;

    sections.forEach((section, index) => {
      this.doc
        .fontSize(12)
        .fillColor('#2d3748')
        .text(
          `${index + 1}. ${section.title}`,
          this.margins.left + 20,
          this.currentY,
          {
            width: this.contentWidth - 40,
          }
        );
      this.currentY += 20;
    });
  }

  /**
   * Generate content section
   */
  private async generateSection(section: PDFSection): Promise<void> {
    // Section title
    this.doc
      .fontSize(18)
      .fillColor('#1a365d')
      .text(section.title, this.margins.left, this.currentY);
    this.currentY += 30;

    // Section description
    if (section.description) {
      this.doc
        .fontSize(12)
        .fillColor('#4a5568')
        .text(section.description, this.margins.left, this.currentY, {
          width: this.contentWidth,
        });
      this.currentY += 20;
    }

    // Process content items
    for (const item of section.content) {
      await this.renderContentItem(item);
    }
  }

  /**
   * Render individual content item
   */
  private async renderContentItem(item: PDFContentItem): Promise<void> {
    switch (item.type) {
      case 'text':
        this.renderText(item);
        break;
      case 'table':
        this.renderTable(item.config as TableConfig);
        break;
      case 'chart':
        await this.renderChart(item.config as ChartConfig);
        break;
      case 'summary_box':
        this.renderSummaryBox(item);
        break;
      case 'key_metrics':
        this.renderKeyMetrics(item);
        break;
    }
    this.currentY += 20; // Add spacing between items
  }

  /**
   * Render text content
   */
  private renderText(item: PDFContentItem): void {
    const fontSize = item.style?.fontSize || 12;
    const color = item.style?.color || '#2d3748';

    this.doc.fontSize(fontSize).fillColor(color).text(item.content as string, this.margins.left, this.currentY, {
      width: this.contentWidth,
    });

    this.currentY += Math.ceil((item.content as string).length / 80) * (fontSize + 2);
  }

  /**
   * Render table
   */
  private renderTable(config: TableConfig): void {
    const rowHeight = 25;
    const defaultColumnWidth = this.contentWidth / config.headers.length;
    const columnWidths = config.columnWidths || config.headers.map(() => defaultColumnWidth);

    // Check if table fits on current page
    const tableHeight = (config.rows.length + 1) * rowHeight;
    if (this.currentY + tableHeight > this.pageHeight - this.margins.bottom) {
      this.addNewPage();
    }

    // Table headers
    let xPosition = this.margins.left;
    
    // Header background
    this.doc
      .rect(this.margins.left, this.currentY, this.contentWidth, rowHeight)
      .fillColor('#f7fafc')
      .fill();

    config.headers.forEach((header, index) => {
      this.doc
        .fontSize(10)
        .fillColor('#1a365d')
        .text(header, xPosition + 5, this.currentY + 8, {
          width: columnWidths[index] - 10,
          align: config.alignment?.[index] || 'left',
        });
      xPosition += columnWidths[index];
    });

    this.currentY += rowHeight;

    // Table rows
    config.rows.forEach((row, rowIndex) => {
      xPosition = this.margins.left;
      
      // Alternate row background
      if (rowIndex % 2 === 0) {
        this.doc
          .rect(this.margins.left, this.currentY, this.contentWidth, rowHeight)
          .fillColor('#fafafa')
          .fill();
      }

      row.forEach((cell, cellIndex) => {
        let cellContent = String(cell);
        
        // Format currency if specified
        if (config.formatting?.currency?.includes(cellIndex) && typeof cell === 'number') {
          cellContent = formatCentsToDollars(cell);
        }
        
        // Format percentage if specified
        if (config.formatting?.percentage?.includes(cellIndex) && typeof cell === 'number') {
          cellContent = `${(cell * 100).toFixed(2)}%`;
        }

        this.doc
          .fontSize(9)
          .fillColor('#2d3748')
          .text(cellContent, xPosition + 5, this.currentY + 8, {
            width: columnWidths[cellIndex] - 10,
            align: config.alignment?.[cellIndex] || 'left',
          });
        xPosition += columnWidths[cellIndex];
      });

      this.currentY += rowHeight;
    });

    // Table border
    this.doc
      .rect(this.margins.left, this.currentY - (config.rows.length + 1) * rowHeight, this.contentWidth, (config.rows.length + 1) * rowHeight)
      .stroke('#e2e8f0');
  }

  /**
   * Render simple chart (basic bar chart for now)
   */
  private async renderChart(config: ChartConfig): Promise<void> {
    const chartHeight = config.height || 200;
    const chartWidth = config.width || this.contentWidth - 100;
    const chartX = this.margins.left + 50;
    const chartY = this.currentY;

    // Chart title
    this.doc
      .fontSize(14)
      .fillColor('#1a365d')
      .text(config.title, this.margins.left, this.currentY);
    this.currentY += 30;

    if (config.type === 'bar') {
      this.renderBarChart(config, chartX, this.currentY, chartWidth, chartHeight);
    } else if (config.type === 'pie') {
      this.renderPieChart(config, chartX, this.currentY, chartWidth, chartHeight);
    }

    this.currentY += chartHeight + 20;
  }

  /**
   * Render bar chart
   */
  private renderBarChart(config: ChartConfig, x: number, y: number, width: number, height: number): void {
    const maxValue = Math.max(...config.data.values);
    const barWidth = (width - 100) / config.data.values.length;
    const colors = ['#4299e1', '#48bb78', '#ed8936', '#9f7aea', '#38b2ac'];

    config.data.values.forEach((value, index) => {
      const barHeight = (value / maxValue) * (height - 50);
      const barX = x + index * barWidth + 10;
      const barY = y + height - barHeight - 20;

      // Draw bar
      this.doc
        .rect(barX, barY, barWidth - 20, barHeight)
        .fillColor(colors[index % colors.length])
        .fill();

      // Label
      this.doc
        .fontSize(8)
        .fillColor('#2d3748')
        .text(
          config.data.labels[index],
          barX,
          y + height - 15,
          {
            width: barWidth - 20,
            align: 'center',
          }
        );

      // Value
      this.doc
        .fontSize(8)
        .fillColor('#2d3748')
        .text(
          formatCentsToDollars(value),
          barX,
          barY - 15,
          {
            width: barWidth - 20,
            align: 'center',
          }
        );
    });

    // Y-axis labels
    for (let i = 0; i <= 5; i++) {
      const labelValue = (maxValue / 5) * i;
      const labelY = y + height - 20 - (i * (height - 50) / 5);
      
      this.doc
        .fontSize(8)
        .fillColor('#718096')
        .text(
          formatCentsToDollars(labelValue),
          x - 45,
          labelY - 4,
          {
            width: 40,
            align: 'right',
          }
        );
    }
  }

  /**
   * Render pie chart (simplified version without arc method)
   */
  private renderPieChart(config: ChartConfig, x: number, y: number, width: number, height: number): void {
    const centerX = x + width / 2;
    const centerY = y + height / 2;
    const radius = Math.min(width, height) / 3;
    const total = config.data.values.reduce((sum, value) => sum + value, 0);
    const colors = ['#4299e1', '#48bb78', '#ed8936', '#9f7aea', '#38b2ac'];

    // For now, just render as a legend with squares
    // This is a simplified version since PDFKit's arc method isn't available in this version
    this.doc
      .fontSize(12)
      .fillColor('#1a365d')
      .text('Distribution Breakdown:', centerX - radius, centerY - radius);

    config.data.values.forEach((value, index) => {
      const percentage = ((value / total) * 100).toFixed(1);
      const legendY = centerY - radius + 30 + index * 20;
      
      // Color square
      this.doc
        .rect(centerX - radius, legendY, 15, 15)
        .fillColor(colors[index % colors.length])
        .fill();

      // Label and value
      this.doc
        .fontSize(10)
        .fillColor('#2d3748')
        .text(
          `${config.data.labels[index]}: ${formatCentsToDollars(value)} (${percentage}%)`,
          centerX - radius + 20,
          legendY + 3
        );
    });
  }

  /**
   * Render summary box
   */
  private renderSummaryBox(item: PDFContentItem): void {
    const boxHeight = 60;
    const boxWidth = this.contentWidth;

    // Background box
    this.doc
      .rect(this.margins.left, this.currentY, boxWidth, boxHeight)
      .fillColor('#f0f9ff')
      .fill()
      .strokeColor('#0369a1')
      .stroke();

    // Content
    this.doc
      .fontSize(14)
      .fillColor('#0369a1')
      .text(item.title || 'Summary', this.margins.left + 15, this.currentY + 10);

    this.doc
      .fontSize(11)
      .fillColor('#1e40af')
      .text(item.content as string, this.margins.left + 15, this.currentY + 30, {
        width: boxWidth - 30,
      });

    this.currentY += boxHeight;
  }

  /**
   * Render key metrics grid
   */
  private renderKeyMetrics(item: PDFContentItem): void {
    const metrics = item.content as Array<{ label: string; value: string; change?: string }>;
    const metricsPerRow = 3;
    const metricWidth = this.contentWidth / metricsPerRow;
    const metricHeight = 80;

    for (let i = 0; i < metrics.length; i += metricsPerRow) {
      for (let j = 0; j < metricsPerRow && i + j < metrics.length; j++) {
        const metric = metrics[i + j];
        const metricX = this.margins.left + j * metricWidth;

        // Metric box
        this.doc
          .rect(metricX + 5, this.currentY, metricWidth - 10, metricHeight)
          .fillColor('#fafafa')
          .fill()
          .strokeColor('#e2e8f0')
          .stroke();

        // Metric value
        this.doc
          .fontSize(20)
          .fillColor('#1a365d')
          .text(metric.value, metricX + 15, this.currentY + 15, {
            width: metricWidth - 30,
            align: 'center',
          });

        // Metric label
        this.doc
          .fontSize(10)
          .fillColor('#4a5568')
          .text(metric.label, metricX + 15, this.currentY + 45, {
            width: metricWidth - 30,
            align: 'center',
          });

        // Change indicator
        if (metric.change) {
          this.doc
            .fontSize(9)
            .fillColor(metric.change.startsWith('+') ? '#22c55e' : '#ef4444')
            .text(metric.change, metricX + 15, this.currentY + 60, {
              width: metricWidth - 30,
              align: 'center',
            });
        }
      }
      this.currentY += metricHeight + 10;
    }
  }

  /**
   * Add new page
   */
  private addNewPage(): void {
    this.doc.addPage();
    this.currentY = this.margins.top;
  }

  /**
   * Add page numbers to all pages
   */
  private addPageNumbers(): void {
    const range = this.doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      this.doc.switchToPage(i);
      this.doc
        .fontSize(9)
        .fillColor('#718096')
        .text(
          `Page ${i + 1} of ${range.count}`,
          this.margins.left,
          this.pageHeight - this.margins.bottom + 20,
          {
            width: this.contentWidth,
            align: 'center',
          }
        );
    }
  }

  /**
   * Format date range for display
   */
  private formatDateRange(period: { startDate: Date; endDate: Date }): string {
    const start = period.startDate.toLocaleDateString();
    const end = period.endDate.toLocaleDateString();
    return `${start} - ${end}`;
  }
}

export interface PDFSection {
  title: string;
  description?: string;
  content: PDFContentItem[];
}

export interface PDFContentItem {
  type: 'text' | 'table' | 'chart' | 'summary_box' | 'key_metrics';
  title?: string;
  content: string | any[] | any;
  config?: TableConfig | ChartConfig;
  style?: {
    fontSize?: number;
    color?: string;
    bold?: boolean;
  };
}
