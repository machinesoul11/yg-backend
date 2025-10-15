/**
 * Bank Statement Reconciliation Service
 * 
 * Handles bank statement reconciliation by parsing bank statements in various formats
 * and matching them with internal payment records. Supports CSV, OFX, QFX formats
 * and provides automated matching with manual review capabilities.
 */

import { PrismaClient } from '@prisma/client';
import { AuditService } from '@/lib/services/audit.service';
import { 
  BankReconciliationReport,
  BankReconciledTransaction,
  BankTransaction,
  BaseAuditConfig
} from '../types';

export interface BankReconciliationConfig extends BaseAuditConfig {
  bankStatementFile?: string;
  bankName?: string;
  accountNumber?: string;
  autoMatchThreshold?: number; // confidence threshold for auto-matching
  dateToleranceDays?: number;
  amountTolerancePercent?: number;
}

export interface ParsedBankStatement {
  bankName: string;
  accountNumber: string;
  statementPeriod: {
    start: Date;
    end: Date;
  };
  openingBalance: number;
  closingBalance: number;
  transactions: BankTransaction[];
}

export class BankStatementReconciliationService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly auditService: AuditService
  ) {}

  /**
   * Generate comprehensive bank reconciliation report
   */
  async generateReconciliationReport(
    config: BankReconciliationConfig,
    bankStatement: ParsedBankStatement
  ): Promise<BankReconciliationReport> {
    try {
      const { startDate, endDate } = config;

      // Get internal transactions for the period
      const internalTransactions = await this.getInternalTransactions(
        bankStatement.statementPeriod.start,
        bankStatement.statementPeriod.end
      );

      // Perform reconciliation
      const reconciliationResults = await this.performReconciliation(
        bankStatement.transactions,
        internalTransactions,
        config
      );

      // Calculate reconciliation status
      const reconciliationDifference = bankStatement.closingBalance - this.calculateInternalBalance(internalTransactions);

      const report: BankReconciliationReport = {
        id: `bank_reconciliation_${Date.now()}`,
        type: 'BANK_RECONCILIATION',
        generatedAt: new Date(),
        generatedBy: config.requestedBy || 'system',
        periodStart: startDate,
        periodEnd: endDate,
        
        // Bank statement info
        bankStatementId: `stmt_${Date.now()}`,
        bankName: bankStatement.bankName,
        accountNumber: this.maskAccountNumber(bankStatement.accountNumber),
        statementPeriod: bankStatement.statementPeriod,
        
        // Reconciliation results
        ...reconciliationResults,
        
        // Summary
        bankBalanceCents: Math.round(bankStatement.closingBalance * 100),
        calculatedBalanceCents: Math.round(this.calculateInternalBalance(internalTransactions) * 100),
        reconciliationDifferenceCents: Math.round(reconciliationDifference * 100),
        reconciled: Math.abs(reconciliationDifference) < 0.01 // Within 1 cent
      };

      // Store reconciliation results
      await this.storeReconciliationResults(report, bankStatement);

      // Log the reconciliation
      await this.auditService.log({
        action: 'BANK_RECONCILIATION_COMPLETED',
        entityType: 'bank_reconciliation',
        entityId: report.id,
        userId: config.requestedBy,
        after: {
          bankName: report.bankName,
          period: report.statementPeriod,
          reconciled: report.reconciled,
          differenceCents: report.reconciliationDifferenceCents
        }
      });

      return report;
    } catch (error) {
      await this.auditService.log({
        action: 'BANK_RECONCILIATION_FAILED',
        entityType: 'bank_reconciliation',
        entityId: 'unknown',
        userId: config.requestedBy,
        after: {
          error: error instanceof Error ? error.message : 'Unknown error',
          config
        }
      });
      
      throw new Error(`Failed to generate bank reconciliation: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Parse bank statement from various formats
   */
  async parseBankStatement(
    fileContent: string,
    format: 'CSV' | 'OFX' | 'QFX',
    config: BankReconciliationConfig
  ): Promise<ParsedBankStatement> {
    switch (format.toUpperCase()) {
      case 'CSV':
        return this.parseCSVStatement(fileContent, config);
      case 'OFX':
        return this.parseOFXStatement(fileContent);
      case 'QFX':
        return this.parseQFXStatement(fileContent);
      default:
        throw new Error(`Unsupported bank statement format: ${format}`);
    }
  }

  /**
   * Parse CSV bank statement
   */
  private parseCSVStatement(
    csvContent: string,
    config: BankReconciliationConfig
  ): ParsedBankStatement {
    const lines = csvContent.split('\n').filter(line => line.trim());
    const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
    
    // Detect column mappings
    const columnMap = this.detectCSVColumns(headers);
    
    const transactions: BankTransaction[] = [];
    let openingBalance = 0;
    let closingBalance = 0;
    
    for (let i = 1; i < lines.length; i++) {
      const values = this.parseCSVLine(lines[i]);
      
      if (values.length < headers.length) continue;
      
      const transaction = this.mapCSVRowToTransaction(values, columnMap, headers);
      if (transaction) {
        transactions.push(transaction);
        
        // Track balance if available
        if (transaction.balance !== undefined) {
          if (i === 1) openingBalance = transaction.balance;
          closingBalance = transaction.balance;
        }
      }
    }

    return {
      bankName: config.bankName || 'Unknown Bank',
      accountNumber: config.accountNumber || 'Unknown',
      statementPeriod: {
        start: new Date(Math.min(...transactions.map(t => t.date.getTime()))),
        end: new Date(Math.max(...transactions.map(t => t.date.getTime())))
      },
      openingBalance,
      closingBalance,
      transactions
    };
  }

  /**
   * Parse OFX bank statement
   */
  private parseOFXStatement(ofxContent: string): ParsedBankStatement {
    // Basic OFX parsing - in production, consider using a proper OFX parser library
    const transactions: BankTransaction[] = [];
    
    // Extract STMTTRN (statement transaction) elements
    const stmtTrnRegex = /<STMTTRN>(.*?)<\/STMTTRN>/g;
    const matches = ofxContent.match(stmtTrnRegex);
    
    if (matches) {
      matches.forEach((match, index) => {
        const transaction = this.parseOFXTransaction(match, index);
        if (transaction) {
          transactions.push(transaction);
        }
      });
    }

    // Extract account info and balances
    const bankName = this.extractOFXField(ofxContent, 'BANKID') || 'Unknown Bank';
    const accountNumber = this.extractOFXField(ofxContent, 'ACCTID') || 'Unknown';
    const closingBalance = parseFloat(this.extractOFXField(ofxContent, 'BALAMT') || '0');

    return {
      bankName,
      accountNumber,
      statementPeriod: {
        start: new Date(Math.min(...transactions.map(t => t.date.getTime()))),
        end: new Date(Math.max(...transactions.map(t => t.date.getTime())))
      },
      openingBalance: 0, // OFX typically doesn't include opening balance
      closingBalance,
      transactions
    };
  }

  /**
   * Parse QFX bank statement (Quicken format)
   */
  private parseQFXStatement(qfxContent: string): ParsedBankStatement {
    // QFX is similar to OFX but may have slight format differences
    return this.parseOFXStatement(qfxContent);
  }

  /**
   * Detect CSV column mappings
   */
  private detectCSVColumns(headers: string[]) {
    const columnMap: Record<string, number> = {};
    
    headers.forEach((header, index) => {
      const normalized = header.toLowerCase().replace(/[^a-z0-9]/g, '');
      
      if (normalized.includes('date') || normalized.includes('posted')) {
        columnMap.date = index;
      } else if (normalized.includes('description') || normalized.includes('memo')) {
        columnMap.description = index;
      } else if (normalized.includes('amount') || normalized.includes('debit') || normalized.includes('credit')) {
        if (!columnMap.amount) columnMap.amount = index;
      } else if (normalized.includes('balance')) {
        columnMap.balance = index;
      } else if (normalized.includes('reference') || normalized.includes('ref')) {
        columnMap.reference = index;
      }
    });
    
    return columnMap;
  }

  /**
   * Parse CSV line handling quoted values
   */
  private parseCSVLine(line: string): string[] {
    const values: string[] = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        values.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    
    values.push(current.trim());
    return values;
  }

  /**
   * Map CSV row to transaction
   */
  private mapCSVRowToTransaction(
    values: string[],
    columnMap: Record<string, number>,
    headers: string[]
  ): BankTransaction | null {
    try {
      if (!columnMap.date || !columnMap.amount) return null;
      
      const date = new Date(values[columnMap.date]);
      const amountStr = values[columnMap.amount].replace(/[^-0-9.]/g, '');
      const amount = parseFloat(amountStr);
      
      if (isNaN(date.getTime()) || isNaN(amount)) return null;
      
      return {
        id: `csv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        date,
        description: values[columnMap.description] || 'No description',
        amount,
        type: amount >= 0 ? 'CREDIT' : 'DEBIT',
        balance: columnMap.balance ? parseFloat(values[columnMap.balance]) : undefined,
        reference: columnMap.reference ? values[columnMap.reference] : undefined
      };
    } catch (error) {
      return null;
    }
  }

  /**
   * Parse individual OFX transaction
   */
  private parseOFXTransaction(stmtTrn: string, index: number): BankTransaction | null {
    try {
      const trnAmt = parseFloat(this.extractOFXField(stmtTrn, 'TRNAMT') || '0');
      const dtPosted = this.extractOFXField(stmtTrn, 'DTPOSTED');
      const memo = this.extractOFXField(stmtTrn, 'MEMO') || 'No description';
      const fitId = this.extractOFXField(stmtTrn, 'FITID');
      
      if (!dtPosted || isNaN(trnAmt)) return null;
      
      // Parse OFX date format (YYYYMMDD or YYYYMMDDHHMMSS)
      const dateStr = dtPosted.substring(0, 8);
      const year = parseInt(dateStr.substring(0, 4));
      const month = parseInt(dateStr.substring(4, 6)) - 1;
      const day = parseInt(dateStr.substring(6, 8));
      const date = new Date(year, month, day);
      
      return {
        id: fitId || `ofx_${index}`,
        date,
        description: memo,
        amount: trnAmt,
        type: trnAmt >= 0 ? 'CREDIT' : 'DEBIT',
        reference: fitId || undefined
      };
    } catch (error) {
      return null;
    }
  }

  /**
   * Extract field value from OFX content
   */
  private extractOFXField(content: string, fieldName: string): string | null {
    const regex = new RegExp(`<${fieldName}>([^<]+)`, 'i');
    const match = content.match(regex);
    return match ? match[1].trim() : null;
  }

  /**
   * Get internal transactions for reconciliation
   */
  private async getInternalTransactions(startDate: Date, endDate: Date) {
    const transactions = [];

    // Get payments
    const payments = await this.prisma.payment.findMany({
      where: {
        createdAt: { gte: startDate, lte: endDate },
        status: 'COMPLETED'
      }
    });

    transactions.push(...payments.map(p => ({
      id: p.id,
      type: 'payment',
      amount: Number(p.amount),
      date: p.createdAt,
      description: `Payment from ${p.brandId}`,
      metadata: p
    })));

    // Get payouts
    const payouts = await this.prisma.payout.findMany({
      where: {
        createdAt: { gte: startDate, lte: endDate },
        status: 'COMPLETED'
      }
    });

    transactions.push(...payouts.map(p => ({
      id: p.id,
      type: 'payout',
      amount: -(p.amountCents / 100), // Negative for outgoing
      date: p.createdAt,
      description: `Payout to creator ${p.creatorId}`,
      metadata: p
    })));

    return transactions;
  }

  /**
   * Perform reconciliation between bank and internal transactions
   */
  private async performReconciliation(
    bankTransactions: BankTransaction[],
    internalTransactions: any[],
    config: BankReconciliationConfig
  ) {
    const matchedTransactions: BankReconciledTransaction[] = [];
    const unmatchedBank: BankTransaction[] = [];
    const unmatchedInternal: BankTransaction[] = [];

    const dateToleranceDays = config.dateToleranceDays || 3;
    const amountTolerancePercent = config.amountTolerancePercent || 0.01; // 1%
    const autoMatchThreshold = config.autoMatchThreshold || 0.8;

    const matchedInternalIds = new Set();
    const matchedBankIds = new Set();

    // Match transactions
    for (const bankTx of bankTransactions) {
      let bestMatch = null;
      let bestConfidence = 0;

      for (const internalTx of internalTransactions) {
        if (matchedInternalIds.has(internalTx.id)) continue;

        const confidence = this.calculateBankMatchConfidence(
          bankTx,
          internalTx,
          dateToleranceDays,
          amountTolerancePercent
        );

        if (confidence > bestConfidence && confidence >= autoMatchThreshold) {
          bestMatch = internalTx;
          bestConfidence = confidence;
        }
      }

      if (bestMatch) {
        matchedTransactions.push({
          bankTransactionId: bankTx.id,
          internalTransactionId: bestMatch.id,
          bankAmount: bankTx.amount,
          internalAmount: bestMatch.amount,
          bankDate: bankTx.date,
          internalDate: bestMatch.date,
          description: bankTx.description,
          matchType: bestConfidence >= 0.95 ? 'AUTO' : 'FUZZY',
          confidence: bestConfidence
        });

        matchedInternalIds.add(bestMatch.id);
        matchedBankIds.add(bankTx.id);
      }
    }

    // Collect unmatched transactions
    bankTransactions
      .filter(t => !matchedBankIds.has(t.id))
      .forEach(t => unmatchedBank.push(t));

    internalTransactions
      .filter(t => !matchedInternalIds.has(t.id))
      .forEach(t => {
        unmatchedInternal.push({
          id: t.id,
          date: t.date,
          description: t.description,
          amount: t.amount,
          type: t.amount >= 0 ? 'CREDIT' : 'DEBIT',
          metadata: t.metadata
        });
      });

    return {
      matchedTransactions,
      unmatchedBank,
      unmatchedInternal
    };
  }

  /**
   * Calculate match confidence for bank reconciliation
   */
  private calculateBankMatchConfidence(
    bankTx: BankTransaction,
    internalTx: any,
    dateToleranceDays: number,
    amountTolerancePercent: number
  ): number {
    let confidence = 0;

    // Amount match (60% weight)
    const amountDiff = Math.abs(bankTx.amount - internalTx.amount);
    const amountTolerance = Math.abs(internalTx.amount) * amountTolerancePercent;
    
    if (amountDiff <= amountTolerance) {
      confidence += 0.6;
    } else if (amountDiff <= amountTolerance * 2) {
      confidence += 0.3;
    }

    // Date match (30% weight)
    const dateDiff = Math.abs(bankTx.date.getTime() - internalTx.date.getTime());
    const daysDiff = dateDiff / (1000 * 60 * 60 * 24);
    
    if (daysDiff <= 1) {
      confidence += 0.3;
    } else if (daysDiff <= dateToleranceDays) {
      confidence += 0.15;
    }

    // Description match (10% weight)
    if (this.descriptionsMatch(bankTx.description, internalTx.description)) {
      confidence += 0.1;
    }

    return confidence;
  }

  /**
   * Check if descriptions indicate a match
   */
  private descriptionsMatch(bankDesc: string, internalDesc: string): boolean {
    const bankWords = bankDesc.toLowerCase().split(/\s+/);
    const internalWords = internalDesc.toLowerCase().split(/\s+/);
    
    const commonWords = bankWords.filter(word => 
      word.length > 3 && internalWords.includes(word)
    );
    
    return commonWords.length >= 2;
  }

  /**
   * Calculate internal balance for comparison
   */
  private calculateInternalBalance(internalTransactions: any[]): number {
    return internalTransactions.reduce((sum, t) => sum + t.amount, 0);
  }

  /**
   * Mask account number for security
   */
  private maskAccountNumber(accountNumber: string): string {
    if (accountNumber.length <= 4) return accountNumber;
    return '*'.repeat(accountNumber.length - 4) + accountNumber.slice(-4);
  }

  /**
   * Store reconciliation results for audit
   */
  private async storeReconciliationResults(
    report: BankReconciliationReport,
    bankStatement: ParsedBankStatement
  ) {
    await this.auditService.log({
      action: 'BANK_RECONCILIATION_STORED',
      entityType: 'bank_reconciliation',
      entityId: report.id,
      after: {
        reportId: report.id,
        bankName: report.bankName,
        period: report.statementPeriod,
        reconciled: report.reconciled,
        transactionCount: bankStatement.transactions.length,
        matchedCount: report.matchedTransactions.length
      }
    });
  }
}
