declare module "pdf-parse" {
  interface PDFData {
    numpages: number;
    numrender: number;
    info: {
      PDFFormatVersion?: string;
      IsAcroFormPresent?: boolean;
      IsXFAPresent?: boolean;
      Title?: string;
      Author?: string;
      Subject?: string;
      Keywords?: string;
      Creator?: string;
      Producer?: string;
      CreationDate?: string;
      ModDate?: string;
    };
    metadata: unknown;
    text: string;
    version: string;
  }

  interface PDFOptions {
    pagerender?: (pageData: { pageIndex: number; pageInfo: unknown }) => string;
    max?: number;
    version?: string;
  }

  function pdf(dataBuffer: Buffer, options?: PDFOptions): Promise<PDFData>;
  export = pdf;
}
