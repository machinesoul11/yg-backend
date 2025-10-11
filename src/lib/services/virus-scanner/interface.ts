/**
 * Virus Scanner Interface
 * 
 * Provides a unified interface for virus scanning services.
 * Supports multiple scanning providers (ClamAV, VirusTotal, etc.)
 */

export enum VirusScanStatus {
  PENDING = 'pending',
  SCANNING = 'scanning',
  CLEAN = 'clean',
  INFECTED = 'infected',
  ERROR = 'error',
}

export interface ThreatDetails {
  name: string;
  type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description?: string;
}

export interface ScanResult {
  status: VirusScanStatus;
  scanId?: string;
  scannedAt: Date;
  scanEngine: string;
  scanEngineVersion?: string;
  threatsDetected: number;
  threats?: ThreatDetails[];
  metadata?: Record<string, any>;
}

export interface IScannerProvider {
  /**
   * Submit a file for scanning
   * @param fileUrl - URL to the file to scan
   * @param metadata - Additional metadata about the file
   * @returns Scan ID for tracking
   */
  submitScan(fileUrl: string, metadata?: Record<string, any>): Promise<string>;

  /**
   * Submit a file buffer for scanning
   * @param fileBuffer - File contents as buffer
   * @param filename - Original filename
   * @param metadata - Additional metadata
   * @returns Scan ID for tracking
   */
  submitScanFromBuffer(
    fileBuffer: Buffer,
    filename: string,
    metadata?: Record<string, any>
  ): Promise<string>;

  /**
   * Get scan results
   * @param scanId - ID returned from submitScan
   * @returns Scan result
   */
  getScanResult(scanId: string): Promise<ScanResult>;

  /**
   * Check if a scan is complete
   * @param scanId - Scan ID
   * @returns true if scan is complete
   */
  isScanComplete(scanId: string): Promise<boolean>;
}

export class ScannerError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 500
  ) {
    super(message);
    this.name = 'ScannerError';
  }
}
