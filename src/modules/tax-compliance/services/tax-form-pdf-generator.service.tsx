/**
 * Tax Form PDF Generator Service
 * Generates PDF tax forms (1099s, W8-BEN, etc.) using React PDF
 * Extends the existing statement PDF generator infrastructure
 */

import React from 'react';
import { renderToBuffer } from '@react-pdf/renderer';
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Font,
} from '@react-pdf/renderer';
import { PrismaClient } from '@prisma/client';
import {
  Form1099Data,
  TaxDocumentType,
  W8BENData,
  W8BENEData,
  TaxFormGenerationResult,
} from '../types';

// PDF Styles for Tax Forms
const styles = StyleSheet.create({
  page: {
    padding: 30,
    fontSize: 9,
    fontFamily: 'Helvetica',
    backgroundColor: '#FFFFFF',
  },
  // Header Section
  header: {
    marginBottom: 15,
    borderBottom: '1px solid #000000',
    paddingBottom: 10,
  },
  formTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 5,
  },
  formSubtitle: {
    fontSize: 10,
    textAlign: 'center',
    marginBottom: 5,
  },
  taxYear: {
    fontSize: 12,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  // Form Layout
  formRow: {
    flexDirection: 'row',
    marginBottom: 8,
    minHeight: 20,
  },
  formBox: {
    border: '1px solid #000000',
    padding: 4,
    marginRight: 5,
    height: 20,
    justifyContent: 'center',
  },
  formLabel: {
    fontSize: 8,
    fontWeight: 'bold',
    marginBottom: 2,
  },
  formValue: {
    fontSize: 9,
    color: '#000000',
  },
  // Specific form sections
  payerSection: {
    marginBottom: 15,
  },
  recipientSection: {
    marginBottom: 15,
  },
  amountSection: {
    marginBottom: 15,
  },
  // Amount boxes (right-aligned)
  amountBox: {
    border: '1px solid #000000',
    padding: 4,
    width: 100,
    textAlign: 'right',
    height: 20,
    justifyContent: 'center',
  },
  // Instructions and footer
  instructions: {
    marginTop: 20,
    fontSize: 7,
    lineHeight: 1.2,
  },
  footer: {
    marginTop: 20,
    fontSize: 7,
    textAlign: 'center',
    borderTop: '1px solid #000000',
    paddingTop: 10,
  },
  // Special formatting
  checkBox: {
    border: '1px solid #000000',
    width: 10,
    height: 10,
    marginRight: 5,
  },
  signature: {
    borderBottom: '1px solid #000000',
    minHeight: 30,
    marginTop: 10,
  },
});

export class TaxFormPDFGenerator {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Generate PDF for any tax document type
   */
  async generateTaxFormPDF(
    documentType: TaxDocumentType,
    data: any
  ): Promise<TaxFormGenerationResult> {
    let pdfDocument: React.ReactElement;
    let metadata: any = {
      formType: documentType,
      generatedAt: new Date(),
    };

    switch (documentType) {
      case TaxDocumentType.FORM_1099_NEC:
        pdfDocument = <Form1099NECDocument data={data as Form1099Data} />;
        metadata.taxYear = data.taxYear;
        metadata.recipientInfo = {
          name: data.recipientName,
          email: data.recipientEmail,
        };
        break;

      case TaxDocumentType.FORM_1099_MISC:
        pdfDocument = <Form1099MISCDocument data={data as Form1099Data} />;
        metadata.taxYear = data.taxYear;
        metadata.recipientInfo = {
          name: data.recipientName,
          email: data.recipientEmail,
        };
        break;

      case TaxDocumentType.W8_BEN:
        pdfDocument = <W8BENDocument data={data as W8BENData} />;
        metadata.recipientInfo = {
          name: data.individualName,
        };
        break;

      case TaxDocumentType.W8_BEN_E:
        pdfDocument = <W8BENEDocument data={data as W8BENEData} />;
        metadata.recipientInfo = {
          name: data.organizationName,
        };
        break;

      default:
        throw new Error(`Unsupported tax document type: ${documentType}`);
    }

    try {
      const pdfBuffer = await renderToBuffer(pdfDocument);
      
      // Generate storage key
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const storageKey = `tax-forms/${documentType.toLowerCase()}/${data.taxYear || 'current'}/${timestamp}.pdf`;

      metadata.fileSize = pdfBuffer.length;

      return {
        documentId: data.documentId || '',
        pdfBuffer,
        storageKey,
        metadata,
      };
    } catch (error) {
      throw new Error(`Failed to generate PDF: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Generate Form 1099-NEC PDF
   */
  async generateForm1099NEC(data: Form1099Data): Promise<TaxFormGenerationResult> {
    return this.generateTaxFormPDF(TaxDocumentType.FORM_1099_NEC, data);
  }

  /**
   * Generate Form 1099-MISC PDF
   */
  async generateForm1099MISC(data: Form1099Data): Promise<TaxFormGenerationResult> {
    return this.generateTaxFormPDF(TaxDocumentType.FORM_1099_MISC, data);
  }

  /**
   * Generate W8-BEN PDF
   */
  async generateW8BEN(data: W8BENData): Promise<TaxFormGenerationResult> {
    return this.generateTaxFormPDF(TaxDocumentType.W8_BEN, data);
  }

  /**
   * Generate W8-BEN-E PDF
   */
  async generateW8BENE(data: W8BENEData): Promise<TaxFormGenerationResult> {
    return this.generateTaxFormPDF(TaxDocumentType.W8_BEN_E, data);
  }
}

// ============================================================================
// Form 1099-NEC PDF Component
// ============================================================================

interface Form1099NECDocumentProps {
  data: Form1099Data;
}

const Form1099NECDocument: React.FC<Form1099NECDocumentProps> = ({ data }) => (
  <Document>
    <Page size="A4" style={styles.page}>
      {/* Form Header */}
      <View style={styles.header}>
        <Text style={styles.formTitle}>Form 1099-NEC</Text>
        <Text style={styles.formSubtitle}>Nonemployee Compensation</Text>
        <Text style={styles.taxYear}>Tax Year {data.taxYear}</Text>
      </View>

      {/* Payer Information */}
      <View style={styles.payerSection}>
        <Text style={styles.formLabel}>PAYER'S name, street address, city or town, state or province, country, ZIP or foreign postal code, and telephone no.</Text>
        <View style={styles.formBox}>
          <Text style={styles.formValue}>{data.payerName}</Text>
          <Text style={styles.formValue}>{data.payerAddress}</Text>
        </View>
        
        <View style={styles.formRow}>
          <View style={[styles.formBox, { width: 200 }]}>
            <Text style={styles.formLabel}>PAYER'S TIN</Text>
            <Text style={styles.formValue}>{data.payerTIN}</Text>
          </View>
          <View style={[styles.formBox, { width: 200 }]}>
            <Text style={styles.formLabel}>RECIPIENT'S TIN</Text>
            <Text style={styles.formValue}>{data.recipientTIN}</Text>
          </View>
        </View>
      </View>

      {/* Recipient Information */}
      <View style={styles.recipientSection}>
        <Text style={styles.formLabel}>RECIPIENT'S name</Text>
        <View style={styles.formBox}>
          <Text style={styles.formValue}>{data.recipientName}</Text>
        </View>
        
        <Text style={styles.formLabel}>Street address (including apt. no.)</Text>
        <View style={styles.formBox}>
          <Text style={styles.formValue}>{data.recipientAddress}</Text>
        </View>

        <View style={styles.formRow}>
          <View style={[styles.formBox, { width: 150 }]}>
            <Text style={styles.formLabel}>Account number (see instructions)</Text>
            <Text style={styles.formValue}>{data.recipientAccountNumber || ''}</Text>
          </View>
        </View>
      </View>

      {/* Amount Section */}
      <View style={styles.amountSection}>
        <View style={styles.formRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.formLabel}>1. Nonemployee compensation</Text>
          </View>
          <View style={styles.amountBox}>
            <Text style={styles.formValue}>
              ${(data.nonEmployeeCompensationCents / 100).toFixed(2)}
            </Text>
          </View>
        </View>

        <View style={styles.formRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.formLabel}>4. Federal income tax withheld</Text>
          </View>
          <View style={styles.amountBox}>
            <Text style={styles.formValue}>
              ${(data.federalTaxWithheldCents / 100).toFixed(2)}
            </Text>
          </View>
        </View>

        {data.stateTaxWithheldCents && data.stateTaxWithheldCents > 0 && (
          <>
            <View style={styles.formRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.formLabel}>5. State tax withheld</Text>
              </View>
              <View style={styles.amountBox}>
                <Text style={styles.formValue}>
                  ${(data.stateTaxWithheldCents / 100).toFixed(2)}
                </Text>
              </View>
            </View>
            
            <View style={styles.formRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.formLabel}>6. State/Payer's state no.</Text>
              </View>
              <View style={styles.formBox}>
                <Text style={styles.formValue}>{data.statePayerTIN || ''}</Text>
              </View>
            </View>

            <View style={styles.formRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.formLabel}>7. State income</Text>
              </View>
              <View style={styles.amountBox}>
                <Text style={styles.formValue}>
                  ${((data.stateIncomeCents || 0) / 100).toFixed(2)}
                </Text>
              </View>
            </View>
          </>
        )}
      </View>

      {/* Instructions */}
      <View style={styles.instructions}>
        <Text>Copy B - For Recipient</Text>
        <Text>This is important tax information and is being furnished to the IRS. If you are required to file a return, a negligence penalty or other sanction may be imposed on you if this income is taxable and the IRS determines that it has not been reported.</Text>
      </View>

      {/* Footer */}
      <View style={styles.footer}>
        <Text>Form 1099-NEC (Rev. 12-{data.taxYear}) www.irs.gov/Form1099NEC Department of the Treasury - Internal Revenue Service</Text>
      </View>
    </Page>
  </Document>
);

// ============================================================================
// Form 1099-MISC PDF Component
// ============================================================================

const Form1099MISCDocument: React.FC<Form1099NECDocumentProps> = ({ data }) => (
  <Document>
    <Page size="A4" style={styles.page}>
      {/* Similar structure to 1099-NEC but with different fields */}
      <View style={styles.header}>
        <Text style={styles.formTitle}>Form 1099-MISC</Text>
        <Text style={styles.formSubtitle}>Miscellaneous Income</Text>
        <Text style={styles.taxYear}>Tax Year {data.taxYear}</Text>
      </View>

      {/* Payer Information - same as 1099-NEC */}
      <View style={styles.payerSection}>
        <Text style={styles.formLabel}>PAYER'S name, street address, city or town, state or province, country, ZIP or foreign postal code, and telephone no.</Text>
        <View style={styles.formBox}>
          <Text style={styles.formValue}>{data.payerName}</Text>
          <Text style={styles.formValue}>{data.payerAddress}</Text>
        </View>
        
        <View style={styles.formRow}>
          <View style={[styles.formBox, { width: 200 }]}>
            <Text style={styles.formLabel}>PAYER'S TIN</Text>
            <Text style={styles.formValue}>{data.payerTIN}</Text>
          </View>
          <View style={[styles.formBox, { width: 200 }]}>
            <Text style={styles.formLabel}>RECIPIENT'S TIN</Text>
            <Text style={styles.formValue}>{data.recipientTIN}</Text>
          </View>
        </View>
      </View>

      {/* Recipient Information - same as 1099-NEC */}
      <View style={styles.recipientSection}>
        <Text style={styles.formLabel}>RECIPIENT'S name</Text>
        <View style={styles.formBox}>
          <Text style={styles.formValue}>{data.recipientName}</Text>
        </View>
        
        <Text style={styles.formLabel}>Street address (including apt. no.)</Text>
        <View style={styles.formBox}>
          <Text style={styles.formValue}>{data.recipientAddress}</Text>
        </View>

        <View style={styles.formRow}>
          <View style={[styles.formBox, { width: 150 }]}>
            <Text style={styles.formLabel}>Account number (see instructions)</Text>
            <Text style={styles.formValue}>{data.recipientAccountNumber || ''}</Text>
          </View>
        </View>
      </View>

      {/* Amount Section - different fields for MISC */}
      <View style={styles.amountSection}>
        <View style={styles.formRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.formLabel}>3. Other income</Text>
          </View>
          <View style={styles.amountBox}>
            <Text style={styles.formValue}>
              ${((data.miscellaneousIncomeCents || 0) / 100).toFixed(2)}
            </Text>
          </View>
        </View>

        <View style={styles.formRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.formLabel}>4. Federal income tax withheld</Text>
          </View>
          <View style={styles.amountBox}>
            <Text style={styles.formValue}>
              ${(data.federalTaxWithheldCents / 100).toFixed(2)}
            </Text>
          </View>
        </View>
      </View>

      {/* Instructions */}
      <View style={styles.instructions}>
        <Text>Copy B - For Recipient</Text>
        <Text>This is important tax information and is being furnished to the IRS. If you are required to file a return, a negligence penalty or other sanction may be imposed on you if this income is taxable and the IRS determines that it has not been reported.</Text>
      </View>

      {/* Footer */}
      <View style={styles.footer}>
        <Text>Form 1099-MISC (Rev. 12-{data.taxYear}) www.irs.gov/Form1099MISC Department of the Treasury - Internal Revenue Service</Text>
      </View>
    </Page>
  </Document>
);

// ============================================================================
// W8-BEN PDF Component
// ============================================================================

interface W8BENDocumentProps {
  data: W8BENData;
}

const W8BENDocument: React.FC<W8BENDocumentProps> = ({ data }) => (
  <Document>
    <Page size="A4" style={styles.page}>
      <View style={styles.header}>
        <Text style={styles.formTitle}>Form W-8BEN</Text>
        <Text style={styles.formSubtitle}>Certificate of Foreign Status of Beneficial Owner for United States Tax Withholding and Reporting (Individuals)</Text>
      </View>

      {/* Individual Information */}
      <View style={styles.recipientSection}>
        <View style={styles.formRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.formLabel}>1. Name of individual who is the beneficial owner</Text>
            <View style={styles.formBox}>
              <Text style={styles.formValue}>{data.individualName}</Text>
            </View>
          </View>
        </View>

        <View style={styles.formRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.formLabel}>2. Country of citizenship</Text>
            <View style={styles.formBox}>
              <Text style={styles.formValue}>{data.countryOfTaxResidence}</Text>
            </View>
          </View>
        </View>

        <View style={styles.formRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.formLabel}>3. Permanent residence address</Text>
            <View style={styles.formBox}>
              <Text style={styles.formValue}>{data.permanentResidenceAddress}</Text>
            </View>
          </View>
        </View>

        {data.mailingAddress && (
          <View style={styles.formRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.formLabel}>4. Mailing address (if different from above)</Text>
              <View style={styles.formBox}>
                <Text style={styles.formValue}>{data.mailingAddress}</Text>
              </View>
            </View>
          </View>
        )}
      </View>

      {/* Tax Information */}
      <View style={styles.amountSection}>
        {data.foreignTIN && (
          <View style={styles.formRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.formLabel}>6. Foreign tax identifying number</Text>
              <View style={styles.formBox}>
                <Text style={styles.formValue}>{data.foreignTIN}</Text>
              </View>
            </View>
          </View>
        )}

        {data.claimTreatyBenefits && (
          <View style={styles.formRow}>
            <View style={styles.checkBox}>
              <Text style={styles.formValue}>X</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.formLabel}>9. I certify that the beneficial owner is a resident of {data.treatyCountry} within the meaning of the income tax treaty between the United States and that country.</Text>
            </View>
          </View>
        )}
      </View>

      {/* Certification */}
      <View style={styles.instructions}>
        <Text style={styles.formLabel}>Certification</Text>
        <Text>Under penalties of perjury, I declare that I have examined the information on this form and to the best of my knowledge and belief it is true, correct, and complete. I further certify under penalties of perjury that:</Text>
        <Text>• I am the individual that is the beneficial owner (or am authorized to sign for the individual that is the beneficial owner) of all the income to which this form relates or am using this form to document myself for chapter 4 purposes,</Text>
        <Text>• The person named on line 1 of this form is not a U.S. person,</Text>
        <Text>• The income to which this form relates is (a) not effectively connected with the conduct of a trade or business in the United States, (b) effectively connected but is not subject to tax under an applicable income tax treaty, or (c) the partner's share of a partnership's effectively connected income, and</Text>
        <Text>• For broker transactions or barter exchanges, the beneficial owner is an exempt foreign person as defined in the instructions.</Text>
      </View>

      {/* Signature */}
      <View style={styles.signature}>
        <Text style={styles.formLabel}>Sign Here: _________________________ Date: {data.certificationDate.toLocaleDateString()}</Text>
      </View>

      <View style={styles.footer}>
        <Text>Form W-8BEN (Rev. 10-2021) www.irs.gov/FormW8BEN Department of the Treasury - Internal Revenue Service</Text>
      </View>
    </Page>
  </Document>
);

// ============================================================================
// W8-BEN-E PDF Component
// ============================================================================

interface W8BENEDocumentProps {
  data: W8BENEData;
}

const W8BENEDocument: React.FC<W8BENEDocumentProps> = ({ data }) => (
  <Document>
    <Page size="A4" style={styles.page}>
      <View style={styles.header}>
        <Text style={styles.formTitle}>Form W-8BEN-E</Text>
        <Text style={styles.formSubtitle}>Certificate of Status of Beneficial Owner for United States Tax Withholding and Reporting (Entities)</Text>
      </View>

      {/* Entity Information */}
      <View style={styles.recipientSection}>
        <View style={styles.formRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.formLabel}>1. Name of organization that is the beneficial owner</Text>
            <View style={styles.formBox}>
              <Text style={styles.formValue}>{data.organizationName}</Text>
            </View>
          </View>
        </View>

        <View style={styles.formRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.formLabel}>2. Country of incorporation or organization</Text>
            <View style={styles.formBox}>
              <Text style={styles.formValue}>{data.countryOfIncorporation}</Text>
            </View>
          </View>
        </View>

        <View style={styles.formRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.formLabel}>3. Name of disregarded entity receiving the payment (if applicable)</Text>
            <View style={styles.formBox}>
              <Text style={styles.formValue}></Text>
            </View>
          </View>
        </View>

        <View style={styles.formRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.formLabel}>4. Permanent residence address</Text>
            <View style={styles.formBox}>
              <Text style={styles.formValue}>{data.businessAddress}</Text>
            </View>
          </View>
        </View>
      </View>

      {/* Entity Classification */}
      <View style={styles.amountSection}>
        <View style={styles.formRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.formLabel}>5. Entity type</Text>
            <View style={styles.formBox}>
              <Text style={styles.formValue}>{data.entityType}</Text>
            </View>
          </View>
        </View>

        {data.claimTreatyBenefits && (
          <View style={styles.formRow}>
            <View style={styles.checkBox}>
              <Text style={styles.formValue}>X</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.formLabel}>I certify that the beneficial owner is a resident of {data.treatyCountry} within the meaning of the income tax treaty between the United States and that country.</Text>
            </View>
          </View>
        )}
      </View>

      {/* Certification */}
      <View style={styles.instructions}>
        <Text style={styles.formLabel}>Certification</Text>
        <Text>Under penalties of perjury, I declare that I have examined the information on this form and to the best of my knowledge and belief it is true, correct, and complete.</Text>
      </View>

      {/* Signature */}
      <View style={styles.signature}>
        <Text style={styles.formLabel}>Sign Here: _________________________ Date: {data.certificationDate.toLocaleDateString()}</Text>
      </View>

      <View style={styles.footer}>
        <Text>Form W-8BEN-E (Rev. 7-2017) www.irs.gov/FormW8BENE Department of the Treasury - Internal Revenue Service</Text>
      </View>
    </Page>
  </Document>
);
