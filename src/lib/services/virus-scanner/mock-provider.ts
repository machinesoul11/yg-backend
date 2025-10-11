/**
 * Mock Scanner Provider
 * 
 * Placeholder implementation for virus scanning.
 * Replace with actual provider (VirusTotal, ClamAV) in production.
 */

import {
  IScannerProvider,
  ScanResult,
  VirusScanStatus,
  ScannerError,
} from './interface';

export class MockScannerProvider implements IScannerProvider {
  private scans: Map<string, ScanResult> = new Map();

  async submitScan(
    fileUrl: string,
    metadata?: Record<string, any>
  ): Promise<string> {
    const scanId = `mock-scan-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    // Simulate scan result (always clean for mock)
    const result: ScanResult = {
      status: VirusScanStatus.CLEAN,
      scanId,
      scannedAt: new Date(),
      scanEngine: 'mock-scanner',
      scanEngineVersion: '1.0.0',
      threatsDetected: 0,
      metadata: {
        fileUrl,
        ...metadata,
      },
    };

    this.scans.set(scanId, result);

    return scanId;
  }

  async submitScanFromBuffer(
    fileBuffer: Buffer,
    filename: string,
    metadata?: Record<string, any>
  ): Promise<string> {
    const scanId = `mock-scan-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    // Simulate scan result (always clean for mock)
    const result: ScanResult = {
      status: VirusScanStatus.CLEAN,
      scanId,
      scannedAt: new Date(),
      scanEngine: 'mock-scanner',
      scanEngineVersion: '1.0.0',
      threatsDetected: 0,
      metadata: {
        filename,
        fileSize: fileBuffer.length,
        ...metadata,
      },
    };

    this.scans.set(scanId, result);

    return scanId;
  }

  async getScanResult(scanId: string): Promise<ScanResult> {
    const result = this.scans.get(scanId);
    
    if (!result) {
      throw new ScannerError('Scan not found', 'SCAN_NOT_FOUND', 404);
    }

    return result;
  }

  async isScanComplete(scanId: string): Promise<boolean> {
    const result = this.scans.get(scanId);
    return result !== undefined && result.status !== VirusScanStatus.PENDING;
  }
}
