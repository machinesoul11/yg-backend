/**
 * Virus Scanner Service
 * 
 * Factory for creating virus scanner instances based on configuration.
 * 
 * Integration Instructions:
 * 1. For VirusTotal: Set VIRUSTOTAL_API_KEY in environment
 * 2. For ClamAV: Implement ClamAVScannerProvider
 * 3. Update SCANNER_PROVIDER env var to switch providers
 */

import type { IScannerProvider } from './interface';
import { MockScannerProvider } from './mock-provider';

/**
 * Get configured virus scanner provider
 */
export function createScannerProvider(): IScannerProvider {
  const provider = process.env.SCANNER_PROVIDER || 'mock';

  switch (provider) {
    case 'virustotal':
      // TODO: Implement VirusTotal provider
      // return new VirusTotalScannerProvider({
      //   apiKey: process.env.VIRUSTOTAL_API_KEY!,
      // });
      console.warn('[Scanner] VirusTotal not implemented, using mock scanner');
      return new MockScannerProvider();

    case 'clamav':
      // TODO: Implement ClamAV provider
      // return new ClamAVScannerProvider({
      //   host: process.env.CLAMAV_HOST || 'localhost',
      //   port: parseInt(process.env.CLAMAV_PORT || '3310'),
      // });
      console.warn('[Scanner] ClamAV not implemented, using mock scanner');
      return new MockScannerProvider();

    case 'mock':
    default:
      return new MockScannerProvider();
  }
}

/**
 * Singleton scanner instance
 */
export const virusScanner = createScannerProvider();

// Re-export types
export type { IScannerProvider, ScanResult, ThreatDetails } from './interface';
export { VirusScanStatus, ScannerError } from './interface';
